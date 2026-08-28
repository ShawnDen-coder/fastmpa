import { canTransition } from "../lifecycle";
import type { AgentRun, RuntimeEvent } from "../types";
import {
  DuplicateRunError,
  EventSequenceError,
  RunNotFoundError,
  RunVersionConflictError,
} from "./errors";
import { filterEvents, type ListEventsOptions } from "./event-query";
import type { RunStore } from "./run-store";

/* 使用结构化复制隔离调用方对象，避免外部引用修改 Store 内部状态。 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/** 内存版 RunStore，用于 Runtime MVP 和确定性单元测试。 */
export class MemoryRunStore implements RunStore {
  /** 按 runId 保存最新的 Run 快照。 */
  private readonly runs = new Map<string, AgentRun>();
  /** 按 runId 保存事件列表；每个列表的 sequence 必须单调递增。 */
  private readonly events = new Map<string, RuntimeEvent[]>();

  /** 创建 Run，并同时初始化该 Run 的事件列表。 */
  public async create(run: AgentRun): Promise<void> {
    if (this.runs.has(run.runId)) throw new DuplicateRunError(run.runId);
    this.runs.set(run.runId, clone(run));
    this.events.set(run.runId, []);
  }

  /** 返回内部快照的副本；未知 runId 返回 undefined。 */
  public async get(runId: string): Promise<AgentRun | undefined> {
    const run = this.runs.get(runId);
    return run === undefined ? undefined : clone(run);
  }

  /**
   * 按版本执行一次状态转换。
   *
   * expectedVersion 防止并发调用覆盖较新的 Run；next 必须是合法的
   * 生命周期状态，并且版本号恰好比当前版本大 1。
   */
  public async transition(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
  ): Promise<AgentRun> {
    const current = this.runs.get(runId);
    if (current === undefined) throw new RunNotFoundError(runId);
    if (current.version !== expectedVersion) {
      throw new RunVersionConflictError(
        runId,
        expectedVersion,
        current.version,
      );
    }
    if (next.runId !== runId)
      throw new Error(`AgentRun id mismatch: ${runId} -> ${next.runId}`);
    if (!canTransition(current.status, next.status)) {
      throw new Error(
        `Invalid AgentRun transition: ${current.status} -> ${next.status}`,
      );
    }
    if (next.version !== current.version + 1) {
      throw new RunVersionConflictError(
        runId,
        current.version + 1,
        next.version,
      );
    }

    const snapshot = clone(next);
    this.runs.set(runId, snapshot);
    return clone(snapshot);
  }

  /**
   * 追加一个事件。事件必须属于已存在的 Run，且 sequence 大于上一个事件。
   */
  public async appendEvent(event: RuntimeEvent): Promise<void> {
    const events = this.events.get(event.runId);
    if (events === undefined) throw new RunNotFoundError(event.runId);
    const lastSequence = events.at(-1)?.sequence ?? -1;
    if (event.sequence <= lastSequence) {
      throw new EventSequenceError(event.runId, event.sequence, lastSequence);
    }
    events.push(clone(event));
  }

  /** 按追加顺序返回事件副本，不暴露内部数组。 */
  public async listEvents(
    runId: string,
    options: ListEventsOptions = {},
  ): Promise<readonly RuntimeEvent[]> {
    const events = this.events.get(runId);
    if (events === undefined) throw new RunNotFoundError(runId);
    return clone(filterEvents(events, options));
  }
}
