import type { RetryPolicy } from "../retry.js";
import type { RunDependencyKeys } from "./dependencies.js";
import type { PersistedTurnInput } from "./persisted-input.js";

/** 交给 lease-aware Worker 执行的纯数据请求。 */
export interface EnqueueRunInput {
  readonly runId: string;
  readonly turn: PersistedTurnInput;
  readonly dependencies: RunDependencyKeys;
  readonly retryPolicy?: RetryPolicy;
}
