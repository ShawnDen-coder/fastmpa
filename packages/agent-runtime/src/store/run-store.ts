import type { AgentRun, RuntimeEvent } from "../types/index.js";
import type { ListEventsOptions } from "./event-query.js";
import type { ListRunsOptions, RunPage } from "./run-query.js";

export interface RunStore {
  /** 创建一个新的 Run；runId 已存在时必须失败。 */
  create(run: AgentRun): Promise<void>;
  /** 原子创建 Run 与首个事件；两者任意一个失败都不得留下部分数据。 */
  createWithEvent(run: AgentRun, event: RuntimeEvent): Promise<void>;
  /** 查询 Run；找不到时返回 undefined，而不是伪造默认状态。 */
  get(runId: string): Promise<AgentRun | undefined>;
  /** 按 expectedVersion 原子地更新 Run，并校验生命周期转换。 */
  transition(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
  ): Promise<AgentRun>;
  /** 原子更新状态与生命周期事件；任一校验或写入失败都不得留下部分数据。 */
  transitionWithEvent(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
    event: RuntimeEvent,
  ): Promise<AgentRun>;
  /** 追加一个事件；Store 必须拒绝重复或倒退的 sequence。 */
  appendEvent(event: RuntimeEvent): Promise<void>;
  /** 按追加顺序读取指定 Run 的全部事件。 */
  listEvents(
    runId: string,
    options?: ListEventsOptions,
  ): Promise<readonly RuntimeEvent[]>;
  /** 按 `(createdAt, runId)` 稳定排序分页查询 Run。 */
  listRuns(options?: ListRunsOptions): Promise<RunPage>;
  /** Atomically claims an executable Run for one process owner. */
  claim?(
    runId: string,
    ownerId: string,
    now: string,
    leaseMs: number,
  ): Promise<RunLease | undefined>;
}

export interface RunLease {
  readonly runId: string;
  readonly ownerId: string;
  readonly leaseUntil: string;
}
