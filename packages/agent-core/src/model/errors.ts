/** 模型请求失败的结构化错误码。 */
export type ModelErrorCode =
  /** 模型名称、API Key 或运行环境等本地配置不完整，通常不可重试。 */
  | "configuration_error"
  /** API Key 无效或当前凭据没有访问权限，修复凭据前不可重试。 */
  | "authentication_failed"
  /** 模型供应商触发请求频率限制，等待退避时间后可以重试。 */
  | "rate_limited"
  /** 网络故障、供应商服务异常或其他请求失败，是否重试由 retryable 决定。 */
  | "request_failed"
  /** 模型请求超过允许时间，通常可以按 Runtime 策略重试。 */
  | "timeout"
  /** 请求被外部取消，不应作为普通失败自动重试。 */
  | "cancelled"
  /** 供应商返回的 JSON、消息或工具调用不符合协议，通常不可重试。 */
  | "invalid_response";

/** 模型适配器抛出的结构化错误，供 Turn 和 Runtime 判断是否值得重试。 */
export class ModelExecutionError extends Error {
  public readonly code: ModelErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly cause?: unknown;

  public constructor(
    code: ModelErrorCode,
    message: string,
    options?: {
      readonly retryable?: boolean;
      readonly status?: number;
      readonly cause?: unknown;
    },
  ) {
    super(message);
    this.name = "ModelExecutionError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
    this.cause = options?.cause;
  }
}
