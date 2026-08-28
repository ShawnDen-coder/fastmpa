import { AgentCoreError } from "../errors";
import type { GuardContext, GuardResult, TurnGuard } from "./guard";

/** 检查 Runtime 是否已经要求当前 Turn 停止。 */
export class CancellationGuard implements TurnGuard {
  public check(context: GuardContext): GuardResult {
    if (!context.signal?.aborted) return { allowed: true };

    return {
      allowed: false,
      status: "cancelled",
      error: new AgentCoreError("turn_cancelled", "Turn was cancelled"),
    };
  }
}
