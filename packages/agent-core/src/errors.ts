export type AgentErrorCode = 'turn_failed' | 'step_limit_exceeded' | 'turn_cancelled'

/** agent-core 跨模块共享的基础错误。 */
export class AgentCoreError extends Error {
  public readonly code: AgentErrorCode
  public readonly retryable: boolean
  public readonly cause?: unknown

  public constructor(
    code: AgentErrorCode,
    message: string,
    options?: {
      readonly retryable?: boolean
      readonly cause?: unknown
    },
  ) {
    super(message)
    this.name = 'AgentCoreError'
    this.code = code
    this.retryable = options?.retryable ?? false
    this.cause = options?.cause
  }
}
