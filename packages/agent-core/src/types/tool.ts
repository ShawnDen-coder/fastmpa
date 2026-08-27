/** A tool request emitted by the model. */
export interface ToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: string
}

/** A tool the model is allowed to request during a Turn. */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
}

/** Structured error categories that the model or Runtime can reason about. */
export type ToolErrorCode =
  | 'tool_not_found'
  | 'invalid_json'
  | 'invalid_arguments'
  | 'execution_failed'
  | 'cancelled'
  | 'timeout'

export interface ToolError {
  readonly code: ToolErrorCode
  readonly message: string
  readonly retryable: boolean
  readonly details?: unknown
}

/** Successful tool execution. */
export interface SuccessfulToolResult {
  readonly ok: true
  readonly toolCallId: string
  readonly name: string
  readonly content: string
}

/** Failed tool execution represented as data for the Turn loop. */
export interface FailedToolResult {
  readonly ok: false
  readonly toolCallId: string
  readonly name: string
  readonly content: string
  readonly error: ToolError
}

export type ToolResult = SuccessfulToolResult | FailedToolResult
