
/**
 * FastMPA Agent Turn 的实现入口。
 *
 * Turn 表示 Agent 的“一次工作回合”，不是整个 Agent Runtime：
 *
 * - Turn 负责一次模型与工具之间的有限循环；
 * - Runtime 未来负责 Run ID、排队、恢复、并发、调度和持久化；
 * - Domain 负责 APM 业务规则；
 * - Policy / Audit 负责动作门禁和审计。
 *
 * 本文件未来应只负责协调下面的流程，不直接访问数据库、HTTP、
 * Electron 或外部平台：
 *
 * 1. 接收 TurnInput
 *       │
 *       ▼
 * 2. 创建或初始化 TurnContext
 *    - system message
 *    - 用户/事件消息
 *    - 可用工具定义
 *    - 当前 Turn 的元数据
 *       │
 *       ▼
 * 3. 检查取消信号和最大步数
 *       │
 *       ▼
 * 4. 调用 ModelAdapter
 *       │
 *       ├── 返回最终文本
 *       │       └── 生成 TurnResult，Turn 结束
 *       │
 *       ├── 返回 TurnStatus
 *       │       └── 记录 done / waiting / blocked /
 *       │           needs_clarification 等终止状态
 *       │
 *       └── 返回 ToolCall
 *               │
 *               ▼
 *          5. ToolRegistry 查找工具
 *               │
 *               ├── 工具不存在
 *               │       └── 生成失败的 ToolResult
 *               │
 *               └── 工具存在
 *                       │
 *                       ▼
 *                  6. ToolExecutor 校验并执行
 *                     - 校验工具名称和参数
 *                     - 执行受控工具
 *                     - 捕获异常
 *                     - 生成 ToolResult
 *                       │
 *                       ▼
 *                  7. 将 ToolCall / ToolResult 加入上下文
 *                       │
 *                       ▼
 *                  8. 回到第 3 步，开始下一轮
 *
 * Turn 必须在以下任一条件满足时结束：
 *
 * 1. 模型返回最终文本；
 * 2. 模型声明终止状态；
 * 3. 工具或模型发生不可恢复错误；
 * 4. 收到取消信号；
 * 5. 达到最大步数、超时或其他预算上限。
 *
 * 第 5 项是安全边界，不能依赖模型“自觉停止”。任何模型或工具异常
 * 都必须转换为明确的结果，不能伪装成成功，也不能让循环无限继续。
 *
 * 推荐实现顺序：
 *
 * 1. 先定义 types/turn.ts、types/tool.ts 和 types/message.ts；
 * 2. 定义 ModelAdapter，并用 FakeModel 驱动测试；
 * 3. 实现 ToolRegistry 和 ToolExecutor；
 * 4. 实现 Context 与最大步数/取消 Guard；
 * 5. 最后在本文件实现 runTurn 主循环；
 * 6. 为文本回复、工具调用、工具失败、模型失败、取消和超限补测试。
 *
 * 依赖方向应保持为：
 *
 * types / model / tools / context / guards
 *                    │
 *                    ▼
 *                  turn.ts
 *
 * 不要在这里加入 APM 状态机、审批、数据库 Repository 或 Connector。
 * 这些能力会在 Turn 稳定后由其他包通过工具和适配器接入。
 */


/** runTurn 的依赖注入。 */

import { TurnContext } from './context/context'
import { AgentCoreError } from './errors'
import { logger, type Logger } from './logger'
import type { ModelAdapter } from './model/adapter'
import { ToolExecutor } from './tools/executor'
import { ToolRegistry } from './tools/registry'
import { CancellationGuard, checkGuards, StepLimitGuard } from './guards'
import type { TurnEvent, TurnInput, TurnResult, TurnStatus } from './types/turn'


export interface RunTurnOptions {
  readonly model: ModelAdapter
  readonly tools: ToolRegistry
  /** Runtime 可以注入带 agentId/runId/turnId 的 child logger。 */
  readonly logger?: Logger
}

/** 执行一次有限的模型请求、工具执行循环。 */
export async function runTurn(
  input: TurnInput,
  options: RunTurnOptions,
): Promise<TurnResult> {
  // Context 保存本次 Turn 的完整消息历史；每次模型请求都从这里生成上下文。
  const context = new TurnContext(input.messages)
  const events: TurnEvent[] = []
  // Executor 只负责执行工具并把异常转换成结构化 ToolResult。
  const executor = new ToolExecutor(options.tools)
  const maxSteps = input.maxSteps ?? 8
  const log = options.logger ?? logger

  log.info({ maxSteps, messageCount: input.messages.length }, 'turn started')

  const guards = [new CancellationGuard(), new StepLimitGuard()]

  // 每一轮先通过 Guard，再请求模型。
  for (let step = 0; ; step += 1) {
    const guardResult = checkGuards(guards, {
      step,
      maxSteps,
      signal: input.signal,
    })

    if (!guardResult.allowed) {
      log.warn({ step, status: guardResult.status }, 'turn stopped by guard')
      return finishTurn(
        log,
        context,
        events,
        step,
        guardResult.status,
        guardResult.error,
      )
    }

    try {
      events.push({ type: 'model_requested', step })
      log.info({ step, messageCount: context.messages.length }, 'model requested')
      // ModelAdapter 只负责请求模型，不负责执行工具。
      const response = await options.model.complete(
        context.toModelInput(options.tools.definitions()),
      )

      // ModelResponse 是判别联合类型，按 type 分支处理三种响应。
      switch (response.type) {
        case 'text':
          log.info({ step, responseType: response.type }, 'model returned final text')
          context.addAssistantMessage(response.content)
          return finishTurn(log, context, events, step + 1, 'done')

        case 'status':
          log.info({ step, status: response.status }, 'model returned turn status')
          if (response.content) context.addAssistantMessage(response.content)
          return finishTurn(log, context, events, step + 1, response.status)

        case 'tool_calls':
          // 必须先保存 assistant 的 tool_calls，随后追加 tool 结果，消息顺序才符合模型协议。
          // 下一轮模型请求才能看到完整的 assistant -> tool 对话关系。
          context.addAssistantMessage(response.content, response.toolCalls)

          for (const toolCall of response.toolCalls) {
            events.push({
              type: 'tool_called',
              step,
              toolCallId: toolCall.id,
              name: toolCall.name,
            })
            log.info({ step, toolCallId: toolCall.id, toolName: toolCall.name }, 'tool called')

            // 工具失败也会返回 ToolResult，不会因为单个工具失败而直接中断整个 Turn。
            const result = await executor.execute(toolCall)
            context.addToolResult(result)

            events.push({
              type: 'tool_finished',
              step,
              toolCallId: toolCall.id,
              isError: !result.ok,
            })
            log.info({ step, toolCallId: toolCall.id, toolName: toolCall.name, isError: !result.ok }, 'tool finished')
          }
          // 工具结果已经写入 Context，下一轮循环会把结果交给模型继续推理。
          break
      }
    } catch (error) {
      // 模型请求或流程异常统一转换为 AgentCoreError，供 Runtime 判断和统计。
      log.error({ step, err: normalizeError(error) }, 'turn failed')
      return finishTurn(
        log,
        context,
        events,
        step + 1,
        'failed',
        toTurnError(error),
      )
    }
  }

}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function toTurnError(error: unknown): AgentCoreError {
  if (error instanceof AgentCoreError) return error

  const cause = normalizeError(error)
  return new AgentCoreError('turn_failed', cause.message, {
    retryable: true,
    cause,
  })
}

function finishTurn(
  log: Logger,
  context: TurnContext,
  events: TurnEvent[],
  steps: number,
  status: TurnStatus,
  error?: Error,
): TurnResult {
  // 所有正常结束、异常结束和预算结束路径都经过这里，保证结果和日志格式一致。
  events.push({ type: 'turn_finished', status })
  log.info({ status, steps }, 'turn finished')
  return {
    status,
    messages: context.messages,
    events,
    steps,
    ...(error ? { error } : {}),
  }
}