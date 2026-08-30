import type { TurnStatus } from "@shawnden-coder/agent-core";
import type { RunStatus } from "./types/run.js";

/** 将 Core 的回合结果转换为 Runtime 的持久化生命周期状态。 */
export function mapTurnStatusToRunStatus(status: TurnStatus): RunStatus {
  switch (status) {
    case "done":
      return "completed";
    case "waiting":
    case "needs_clarification":
      return "waiting";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}

/** 终态不会再被 Runtime 继续执行或恢复。 */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return (
    status === "completed" || status === "cancelled" || status === "failed"
  );
}

/** 这些状态允许 Worker 领取或继续处理 Run。 */
export function isExecutableRunStatus(status: RunStatus): boolean {
  return status === "queued" || status === "running" || status === "retrying";
}

/** 这些状态可以通过恢复操作重新进入 queued。 */
export function isResumableRunStatus(status: RunStatus): boolean {
  return (
    status === "waiting" || status === "blocked" || status === "interrupted"
  );
}

/** 只有持有租约的执行态才需要心跳和租约丢失保护。 */
export function isLeaseHoldingRunStatus(status: RunStatus): boolean {
  return status === "running" || status === "retrying";
}
