/** Runtime 层状态。它描述一次 AgentRun 的生命周期，不等同于 agent-core 的 TurnStatus。 */
export type RunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "waiting"
  | "blocked"
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
  /** Run 第一次进入 running 的时间；排队期间为空。 */
  readonly startedAt?: string;
  /** Run 进入 completed、cancelled 或 failed 后的结束时间。 */
  readonly finishedAt?: string;
}
