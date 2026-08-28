import type { ToolErrorCode } from "../types/tool";

/**
 * 工具可以使用这个错误类主动声明结构化失败原因。
 * 例如超时可以标记为可重试，业务拒绝通常不可重试。
 */
export class ToolExecutionError extends Error {
  public readonly code: ToolErrorCode;
  public readonly retryable: boolean;
  public readonly details?: unknown;

  public constructor(
    code: ToolErrorCode,
    message: string,
    retryable = false,
    details?: unknown,
  ) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}
