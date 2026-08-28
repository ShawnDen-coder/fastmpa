import type { RunTurnOptions, TurnInput } from "agent-core";
import type { RetryPolicy } from "../retry";

/** 恢复 waiting 或 blocked Run 所需的输入。 */
export interface ResumeRunInput extends RunTurnOptions {
  /** 恢复时追加或重建的 Turn 输入。 */
  readonly turn: TurnInput;
  /** 恢复后的 Turn 仍可使用受控重试策略。 */
  readonly retryPolicy?: RetryPolicy;
}
