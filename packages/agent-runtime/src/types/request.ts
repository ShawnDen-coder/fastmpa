import type { RunTurnOptions, TurnInput } from "agent-core";

/** 启动一次 AgentRun 所需的输入。 */
export interface StartRunInput extends RunTurnOptions {
  /** Run 的唯一 ID；由上层负责生成，便于幂等和追踪。 */
  readonly runId: string;
  /** 传给 agent-core 的用户消息、步数限制和取消信号。 */
  readonly turn: TurnInput;
}
