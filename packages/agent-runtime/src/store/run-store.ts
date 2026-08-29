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
}

/** 支持跨进程 lease 的 Store 扩展；当前由 SQLite 实现。 */
export interface RunLeaseStore extends RunStore {
  /** 原子领取 queued Run、启动执行并记录 run_started 事件。 */
  claimAndStart(
    runId: string,
    ownerId: string,
    now: string,
    leaseMs: number,
  ): Promise<RunLease | undefined>;
  /** 仅当前 owner 可为未过期的执行 lease 续租。 */
  renewLease(
    runId: string,
    ownerId: string,
    now: string,
    leaseMs: number,
  ): Promise<RunLease | undefined>;
  /** 仅当前 owner 可原子转换 Run 并写入事件；可选择在暂停或终态释放 lease。 */
  transitionAsOwnerWithEvent(
    runId: string,
    ownerId: string,
    now: string,
    expectedVersion: number,
    next: AgentRun,
    event: RuntimeEvent,
    options?: { readonly releaseLease?: boolean },
  ): Promise<AgentRun | undefined>;
  /** 仅当前 owner 可追加一批 Turn 观测事件，避免失去 lease 后继续写入。 */
  appendEventsAsOwner(
    runId: string,
    ownerId: string,
    now: string,
    events: readonly RuntimeEvent[],
  ): Promise<boolean>;
  /** 将 lease 已过期的执行 Run 原子标记为 interrupted 后重新排队。 */
  recoverExpiredRuns(now: string, limit: number): Promise<readonly string[]>;
}

export interface RunLease {
  readonly runId: string;
  readonly ownerId: string;
  readonly leaseUntil: string;
}
