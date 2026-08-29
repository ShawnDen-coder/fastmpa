/** Runtime 层状态。它描述一次 AgentRun 的生命周期，不等同于 agent-core 的 TurnStatus。 */
import type { PersistedRunInput } from "./persisted-input.js";
import type { Message, TurnStatus } from "@shawnden-coder/agent-core";

export type RunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "waiting"
  | "blocked"
  | "interrupted"
  | "completed"
  | "cancelled"
  | "failed";

export interface AgentRun {
  /** 一次运行的唯一标识；后续用于查询、取消、恢复和关联事件。 */
  readonly runId: string;
  /** 当前生命周期状态，所有变化必须经过 lifecycle.ts 的转换规则。 */
  readonly status: RunStatus;
  /** 当前运行尝试次数；重试或恢复时递增。 */
  readonly attempt: number;
  /** 乐观锁版本；每次成功状态更新必须递增，用于检测并发修改。 */
  readonly version: number;
  /** Run 首次创建时间，使用 ISO 8601 字符串便于序列化和持久化。 */
  readonly createdAt: string;
  /** 创建时保存的可序列化输入；模型和工具实例不写入数据库。 */
  readonly input?: PersistedRunInput;
  /** Run 第一次进入 running 的时间；排队期间为空。 */
  readonly startedAt?: string;
  /** Run 进入 completed、cancelled 或 failed 后的结束时间。 */
  readonly finishedAt?: string;
  /** 本次 Run 最终或暂停时的 Turn 输出；事件历史另行保存在 RuntimeEvent 中。 */
  readonly result?: PersistedTurnResult;
  /** 可安全写入 Store 的错误投影，绝不保存原生 Error 实例。 */
  readonly error?: SerializedRunError;
}

/** 可持久化的 Turn 输出，不重复保存已写入事件流的 TurnEvent。 */
export interface PersistedTurnResult {
  readonly status: TurnStatus;
  readonly messages: readonly Message[];
  readonly steps: number;
}

/** Error 的 JSON-friendly 投影，保留调用方判断所需的最小结构。 */
export interface SerializedRunError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly retryable?: boolean;
}
