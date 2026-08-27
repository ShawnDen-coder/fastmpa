import { describe, expect, it } from 'vitest'

import {
  FakeModel,
  ToolExecutionError,
  ToolExecutor,
  ToolRegistry,
  TurnContext,
  runTurn,
} from '../src/index'

function createEchoTool() {
  return {
    definition: {
      name: 'echo',
      description: '返回输入内容',
      parameters: {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      },
    },
    validate(args: unknown) {
      if (!args || typeof args !== 'object' || !('value' in args)) {
        throw new Error('value is required')
      }
    },
    execute(args: { value: string }) {
      return args.value
    },
  }
}

describe('ToolRegistry', () => {
  it('注册工具并只暴露工具定义', () => {
    const registry = new ToolRegistry()
    registry.register(createEchoTool())

    expect(registry.get('echo')?.definition.name).toBe('echo')
    expect(registry.definitions()).toEqual([createEchoTool().definition])
    expect('execute' in registry.definitions()[0]).toBe(false)
  })

  it('拒绝空名称和重复工具', () => {
    const registry = new ToolRegistry()

    expect(() => registry.register({
      definition: {
        name: ' ',
        description: 'invalid',
        parameters: {},
      },
      execute: () => null,
    })).toThrow('Tool name is required')

    registry.register(createEchoTool())

    expect(() => registry.register(createEchoTool()))
      .toThrow('Tool already registered: echo')
  })
})

describe('ToolExecutor', () => {
  it('执行成功并序列化结果', async () => {
    const registry = new ToolRegistry()
    registry.register(createEchoTool())

    const result = await new ToolExecutor(registry).execute({
      id: 'call-1',
      name: 'echo',
      arguments: JSON.stringify({ value: 'hello' }),
    })

    expect(result).toEqual({
      ok: true,
      toolCallId: 'call-1',
      name: 'echo',
      content: 'hello',
    })
  })

  it('将未知工具转换为结构化错误', async () => {
    const result = await new ToolExecutor(new ToolRegistry()).execute({
      id: 'call-unknown',
      name: 'missing',
      arguments: '{}',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('tool_not_found')
      expect(result.error.retryable).toBe(false)
    }
  })

  it('将非法 JSON 转换为结构化错误', async () => {
    const registry = new ToolRegistry()
    registry.register(createEchoTool())

    const result = await new ToolExecutor(registry).execute({
      id: 'call-json',
      name: 'echo',
      arguments: '{invalid',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_json')
    }
  })

  it('将参数校验失败转换为结构化错误', async () => {
    const registry = new ToolRegistry()
    registry.register(createEchoTool())

    const result = await new ToolExecutor(registry).execute({
      id: 'call-args',
      name: 'echo',
      arguments: '{}',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_arguments')
      expect(result.error.message).toBe('value is required')
    }
  })

  it('保留 ToolExecutionError 的错误码和可重试属性', async () => {
    const registry = new ToolRegistry()
    registry.register({
      definition: {
        name: 'remote',
        description: '模拟远程工具',
        parameters: {},
      },
      execute() {
        throw new ToolExecutionError('timeout', '远程服务超时', true)
      },
    })

    const result = await new ToolExecutor(registry).execute({
      id: 'call-timeout',
      name: 'remote',
      arguments: '{}',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('timeout')
      expect(result.error.retryable).toBe(true)
    }
  })

  it('将普通执行异常转换为 execution_failed', async () => {
    const registry = new ToolRegistry()
    registry.register({
      definition: {
        name: 'broken',
        description: '模拟失败工具',
        parameters: {},
      },
      execute() {
        throw new Error('unexpected failure')
      },
    })

    const result = await new ToolExecutor(registry).execute({
      id: 'call-broken',
      name: 'broken',
      arguments: '{}',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('execution_failed')
      expect(result.error.message).toBe('unexpected failure')
    }
  })
})

describe('TurnContext', () => {
  it('保持消息顺序并格式化工具错误', () => {
    const context = new TurnContext()
    context.addUserMessage('检查需求')
    context.addAssistantMessage('', [
      {
        id: 'call-1',
        name: 'echo',
        arguments: '{}',
      },
    ])
    context.addToolResult({
      ok: false,
      toolCallId: 'call-1',
      name: 'echo',
      content: 'value is required',
      error: {
        code: 'invalid_arguments',
        message: 'value is required',
        retryable: false,
      },
    })

    expect(context.messages).toHaveLength(3)
    expect(context.messages[2].role).toBe('tool')
    expect(context.messages[2].content)
      .toBe('[tool_error:invalid_arguments] value is required')
  })
})


describe('runTurn', () => {
  it('模型返回文本时结束回合', async () => {
    const model = new FakeModel([
      { type: 'text', content: '你好，我可以帮助你。' },
    ])

    const result = await runTurn(
      {
        messages: [{ role: 'user', content: '你好' }],
      },
      { model, tools: new ToolRegistry() },
    )

    expect(result.status).toBe('done')
    expect(result.steps).toBe(1)
    expect(result.messages.at(-1)).toEqual({
      role: 'assistant',
      content: '你好，我可以帮助你。',
    })
  })

  it('执行工具后写回上下文并再次请求模型', async () => {
    const registry = new ToolRegistry()
    registry.register({
      definition: { name: 'echo', description: '返回输入内容', parameters: {} },
      execute: () => '工具结果',
    })

    const model = new FakeModel([
      {
        type: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'echo', arguments: '{}' }],
      },
      { type: 'text', content: '最终回答' },
    ])

    const result = await runTurn(
      {
        messages: [{ role: 'user', content: '执行工具' }],
        maxSteps: 3,
      },
      { model, tools: registry },
    )

    expect(result.status).toBe('done')
    expect(result.steps).toBe(2)
    expect(result.messages.map((message) => message.role)).toEqual([
      'user', 'assistant', 'tool', 'assistant',
    ])
    expect(model.requests).toHaveLength(2)
    expect(model.requests[1].messages[1].toolCalls).toHaveLength(1)
    expect(model.requests[1].messages[2].content).toBe('工具结果')
  })
  it('模型异常包装为 AgentCoreError', async () => {
    const cause = new Error('provider unavailable')
    const result = await runTurn(
      { messages: [{ role: 'user', content: '请求' }] },
      { model: new FakeModel([cause]), tools: new ToolRegistry() },
    )

    expect(result.status).toBe('failed')
    expect(result.error).toMatchObject({ name: 'AgentCoreError', code: 'turn_failed', retryable: true, cause })
  })

  it('超过最大步数返回 step_limit_exceeded', async () => {
    const model = new FakeModel([{ type: 'tool_calls', content: '', toolCalls: [] }])
    const result = await runTurn(
      { messages: [{ role: 'user', content: '继续' }], maxSteps: 1 },
      { model, tools: new ToolRegistry() },
    )

    expect(result.status).toBe('failed')
    expect(result.error).toMatchObject({ name: 'AgentCoreError', code: 'step_limit_exceeded' })
  })
})
