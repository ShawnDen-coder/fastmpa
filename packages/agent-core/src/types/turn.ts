import type { Message } from './message'
import type { ToolDefinition } from './tool'

/**
 * Agent Turn 的终止状态。
 *
 * 这些状态描述的是“本次 Turn 接下来应该如何处理”，
 * 不是 APM 业务实体本身的状态。
 */
export type TurnStatus =
  /** 本次 Turn 已完成，没有需要继续处理的工作。 */
  | 'done'
  /** 当前需要等待外部事件，例如等待用户、负责人或平台回复。 */
  | 'waiting'
  /** 当前工作无法继续，存在明确的阻塞原因，需要人工或其他流程介入。 */
  | 'blocked'
  /** 本次 Turn 被外部取消，不代表业务工作本身失败。 */
  | 'cancelled'
  /** 输入信息不足，Agent 需要用户补充澄清后才能继续。 */
  | 'needs_clarification'
  /** 模型、工具、取消或预算限制导致本次 Turn 失败。 */
  | 'failed'

/**
 * 与运行环境无关的取消信号。
 * 具体 Runtime 可以用 AbortController 适配它。
 */
export interface CancellationSignal {
  readonly aborted: boolean
  addEventListener?: (type: 'abort', listener: () => void) => void
  removeEventListener?: (type: 'abort', listener: () => void) => void
}

export interface TurnInput {
  readonly messages: readonly Message[]
  readonly maxSteps?: number
  readonly signal?: CancellationSignal
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** 发送给模型的 TurnInput 投影，不包含 Runtime 控制字段。 */
export type ModelInput = Pick<TurnInput, 'messages'> & {
  readonly tools: readonly ToolDefinition[]
}

/**
 * Turn 运行期间产生的可观察事件。
 *
 * 这些事件用于调试、测试和未来 Runtime 的持久化，
 * 不等同于对外发送的消息。
 */
export type TurnEvent =
  /** Turn 向模型发起了一次请求，step 表示当前循环轮次。 */
  | { readonly type: 'model_requested'; readonly step: number }
  /** 模型请求调用工具，记录工具调用 ID 和工具名称。 */
  | { readonly type: 'tool_called'; readonly step: number; readonly toolCallId: string; readonly name: string }
  /** 工具执行完成，isError 表示工具是否执行失败。 */
  | { readonly type: 'tool_finished'; readonly step: number; readonly toolCallId: string; readonly isError: boolean }
  /** Turn 进入终止状态，status 表示本次 Turn 的最终结果。 */
  | { readonly type: 'turn_finished'; readonly status: TurnStatus }

export interface TurnResult {
  readonly status: TurnStatus
  readonly messages: readonly Message[]
  readonly events: readonly TurnEvent[]
  readonly steps: number
  readonly error?: Error
}


