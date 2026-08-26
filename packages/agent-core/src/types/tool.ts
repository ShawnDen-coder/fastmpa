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

/** The normalized result returned by a tool execution. */
export interface ToolResult {
  readonly toolCallId: string
  readonly name: string
  readonly content: string
  readonly isError: boolean
}

