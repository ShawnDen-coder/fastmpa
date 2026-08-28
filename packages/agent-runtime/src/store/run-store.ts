import type { AgentRun, RuntimeEvent } from "../types";

export interface RunStore {
  /** 创建一个新的 Run；runId 已存在时必须失败。 */
  create(run: AgentRun): Promise<void>;
  /** 查询 Run；找不到时返回 undefined，而不是伪造默认状态。 */
  get(runId: string): Promise<AgentRun | undefined>;
  /** 按 expectedVersion 原子地更新 Run，并校验生命周期转换。 */
  transition(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
  ): Promise<AgentRun>;
  /** 可选的原子状态+事件更新；数据库 Store 应在事务中实现。 */
  transitionWithEvent?(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
    event: RuntimeEvent,
  ): Promise<AgentRun>;
  /** 追加一个事件；Store 必须拒绝重复或倒退的 sequence。 */
  appendEvent(event: RuntimeEvent): Promise<void>;
  /** 按追加顺序读取指定 Run 的全部事件。 */
  listEvents(runId: string): Promise<readonly RuntimeEvent[]>;
}

