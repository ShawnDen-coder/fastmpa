/** Runtime 的失败重试策略。 */
import type { TurnResult } from "@shawnden-coder/agent-core";

export interface RetryPolicy {
  /** 允许的总尝试次数；1 表示不重试。 */
  readonly maxAttempts: number;
  /** 每次重试前等待的毫秒数；当前版本使用固定延迟。 */
  readonly delayMs?: number;
}

export const noRetry: RetryPolicy = { maxAttempts: 1 };

/** 只有错误明确可重试、未超限且未产生成功工具副作用时才重试。 */
export function shouldRetry(
  error: unknown,
  attempt: number,
  policy: RetryPolicy,
  result?: Pick<TurnResult, "events">,
): boolean {
  return (
    isRetryable(error) &&
    attempt < policy.maxAttempts &&
    !hasSuccessfulToolCall(result)
  );
}

/**
 * Whole-Turn retry replays the original input. A successful tool call may have
 * caused an external side effect, so retrying is conservatively disabled until
 * tools expose explicit idempotency/read-only metadata.
 */
export function hasSuccessfulToolCall(
  result: Pick<TurnResult, "events"> | undefined,
): boolean {
  return (
    result?.events.some(
      (event) => event.type === "tool_finished" && !event.isError,
    ) ?? false
  );
}

function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  );
}
