/** Runtime 的失败重试策略。 */
export interface RetryPolicy {
  /** 允许的总尝试次数；1 表示不重试。 */
  readonly maxAttempts: number;
  /** 每次重试前等待的毫秒数；当前版本使用固定延迟。 */
  readonly delayMs?: number;
}

/** 默认不重试，避免改变现有调用方行为。 */
export const noRetry: RetryPolicy = { maxAttempts: 1 };

/** 只有错误明确标记 retryable，且尚未达到次数上限时才重试。 */
export function shouldRetry(
  error: unknown,
  attempt: number,
  policy: RetryPolicy,
): boolean {
  return isRetryable(error) && attempt < policy.maxAttempts;
}

function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  );
}
