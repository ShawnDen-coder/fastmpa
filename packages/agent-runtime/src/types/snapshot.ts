import type { AgentRun, RuntimeEvent } from "./index.js";

/** Runtime 对外提供的只读 Run 快照。 */
export interface RunSnapshot {
  /** Run 当前状态和版本。 */
  readonly run: AgentRun;
  /** 按 sequence 排序的完整事件历史。 */
  readonly events: readonly RuntimeEvent[];
}
