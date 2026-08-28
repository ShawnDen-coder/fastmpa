import type { TurnInput } from "@shawnden-coder/agent-core";
import type { RetryPolicy } from "../retry";

/** 可以安全写入数据库的 Turn 输入，不包含模型、工具和取消信号。 */
export type PersistedTurnInput = Omit<TurnInput, "signal">;

/** Run 重启或恢复所需的可序列化输入。 */
export interface PersistedRunInput {
  /** 用户消息、步数限制和业务元数据。 */
  readonly turn: PersistedTurnInput;
  /** 本次 Run 使用的重试策略。 */
  readonly retryPolicy?: RetryPolicy;
}
