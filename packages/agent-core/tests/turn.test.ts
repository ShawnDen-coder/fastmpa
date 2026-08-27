import { describe, expect, it } from 'vitest'

import { FakeModel, ModelExecutionError, ToolRegistry, runTurn } from '../src/index'
import type { ModelAdapter } from '../src/index'

function input(content = '请求') {
  return { messages: [{ role: 'user' as const, content }] }
}

describe('runTurn', () => {
  it('模型返回文本时结束回合', async () => {
    const result = await runTurn(input('你好'), {
      model: new FakeModel([{ type: 'text', content: '你好，我可以帮助你。' }]),
      tools: new ToolRegistry(),
    })

    expect(result.status).toBe('done')
    expect(result.steps).toBe(1)
    expect(result.messages.at(-1)).toEqual({
      role: 'assistant',
      content: '你好，我可以帮助你。',
    })
    expect(result.events.at(-1)).toEqual({ type: 'turn_finished', status: 'done' })
  })

  it('执行工具后写回上下文并再次请求模型', async () => {
    const registry = new ToolRegistry()
    registry.register({
      definition: { name: 'echo', description: '返回输入内容', parameters: {} },
      validate() {},
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

    const result = await runTurn(input('执行工具'), {
      model,
      tools: registry,
    })

    expect(result.status).toBe('done')
    expect(result.steps).toBe(2)
    expect(result.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ])
    expect(model.requests).toHaveLength(2)
    expect(model.requests[1].messages[1].toolCalls).toHaveLength(1)
    expect(model.requests[1].messages[2].content).toBe('工具结果')
  })

  it('支持多个工具调用并在全部完成后继续请求模型', async () => {
    const registry = new ToolRegistry()
    registry.register({
      definition: { name: 'one', description: '工具一', parameters: {} },
      validate() {},
      execute: () => '结果一',
    })
    registry.register({
      definition: { name: 'two', description: '工具二', parameters: {} },
      validate() {},
      execute: () => '结果二',
    })
    const model = new FakeModel([
      {
        type: 'tool_calls',
        content: '',
        toolCalls: [
          { id: 'call-1', name: 'one', arguments: '{}' },
          { id: 'call-2', name: 'two', arguments: '{}' },
        ],
      },
      { type: 'text', content: '完成' },
    ])

    const result = await runTurn(input(), { model, tools: registry })

    expect(result.status).toBe('done')
    expect(result.messages.map((message) => message.content)).toEqual([
      '请求',
      '',
      '结果一',
      '结果二',
      '完成',
    ])
    expect(result.events.filter((event) => event.type === 'tool_finished')).toHaveLength(2)
  })

  it('工具失败后仍把错误写入上下文并交给模型决定下一步', async () => {
    const model = new FakeModel([
      {
        type: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'missing-1', name: 'missing', arguments: '{}' }],
      },
      { type: 'text', content: '工具不可用' },
    ])

    const result = await runTurn(input(), {
      model,
      tools: new ToolRegistry(),
    })

    expect(result.status).toBe('done')
    expect(result.messages[2].content).toContain('[tool_error:tool_not_found]')
  })

  it.each(['waiting', 'blocked', 'needs_clarification'] as const)(
    '模型返回 %s 状态时结束回合',
    async (status) => {
      const result = await runTurn(input(), {
        model: new FakeModel([{ type: 'status', status, content: '需要后续处理' }]),
        tools: new ToolRegistry(),
      })

      expect(result.status).toBe(status)
      expect(result.messages.at(-1)?.content).toBe('需要后续处理')
    },
  )

  it('收到取消信号时不请求模型', async () => {
    const model = new FakeModel([{ type: 'text', content: '不应执行' }])
    const result = await runTurn(
      { ...input(), signal: { aborted: true } },
      {
        model,
        tools: new ToolRegistry(),
      },
    )

    expect(result.status).toBe('cancelled')
    expect(result.steps).toBe(0)
    expect(model.requests).toHaveLength(0)
  })

  it('模型异常包装为 AgentCoreError', async () => {
    const cause = new Error('provider unavailable')
    const result = await runTurn(input(), {
      model: new FakeModel([cause]),
      tools: new ToolRegistry(),
    })

    expect(result.status).toBe('failed')
    expect(result.error).toMatchObject({
      name: 'AgentCoreError',
      code: 'turn_failed',
      retryable: false,
      cause,
    })
  })

  it('保留结构化模型错误的可重试语义', async () => {
    const error = new ModelExecutionError('rate_limited', 'too many requests', {
      retryable: true,
      status: 429,
    })
    const result = await runTurn(input(), {
      model: new FakeModel([error]),
      tools: new ToolRegistry(),
    })

    expect(result.status).toBe('failed')
    expect(result.error).toMatchObject({
      name: 'AgentCoreError',
      code: 'turn_failed',
      retryable: true,
    })
  })

  it('模型请求期间取消时返回 cancelled', async () => {
    const controller = new AbortController()
    const model: ModelAdapter = {
      complete(_input, options) {
        return new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener?.('abort', () => reject(new Error('aborted')))
          controller.abort()
        })
      },
    }

    const result = await runTurn(
      { ...input(), signal: controller.signal },
      { model, tools: new ToolRegistry() },
    )

    expect(result.status).toBe('cancelled')
    expect(result.error).toMatchObject({ code: 'turn_cancelled' })
  })

  it('多个工具之间取消时不再执行后续工具', async () => {
    const controller = new AbortController()
    let secondToolCalls = 0
    const registry = new ToolRegistry()
    registry.register({
      definition: { name: 'cancel', description: '取消 Turn', parameters: {} },
      validate() {},
      execute(_argumentsValue, context) {
        expect(context.signal).toBe(controller.signal)
        controller.abort()
        return 'cancelled'
      },
    })
    registry.register({
      definition: { name: 'second', description: '不应执行', parameters: {} },
      validate() {},
      execute() {
        secondToolCalls += 1
      },
    })

    const result = await runTurn(
      { ...input(), signal: controller.signal },
      {
        model: new FakeModel([
          {
            type: 'tool_calls',
            content: '',
            toolCalls: [
              { id: 'call-1', name: 'cancel', arguments: '{}' },
              { id: 'call-2', name: 'second', arguments: '{}' },
            ],
          },
        ]),
        tools: registry,
      },
    )

    expect(result.status).toBe('cancelled')
    expect(secondToolCalls).toBe(0)
  })

  it('超过最大步数返回 step_limit_exceeded', async () => {
    const model = new FakeModel([{ type: 'tool_calls', content: '', toolCalls: [] }])
    const result = await runTurn(
      { ...input(), maxSteps: 1 },
      {
        model,
        tools: new ToolRegistry(),
      },
    )

    expect(result.status).toBe('failed')
    expect(result.error).toMatchObject({
      name: 'AgentCoreError',
      code: 'step_limit_exceeded',
    })
  })
})
