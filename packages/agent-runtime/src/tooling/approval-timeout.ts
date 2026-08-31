import type { ApprovalStore } from "./approval-store.js";
import type { ToolPipeline } from "./pipeline.js";

export interface ApprovalTimeoutCoordinatorOptions {
  readonly store: ApprovalStore;
  readonly pipeline: ToolPipeline;
  readonly now?: () => number;
  readonly onTimeout?: (approvalId: string, runId: string) => void;
}

/** Reconciles pending approvals after startup and while the app is running. */
export class ApprovalTimeoutCoordinator {
  private readonly now: () => number;
  public constructor(
    private readonly options: ApprovalTimeoutCoordinatorOptions,
  ) {
    this.now = options.now ?? Date.now;
  }
  public scan(): number {
    let count = 0;
    for (const approval of this.options.store.list?.() ?? []) {
      if (!approval.expiresAt || Date.parse(approval.expiresAt) > this.now())
        continue;
      try {
        this.options.pipeline.reject(
          approval.approvalId,
          approval.runId,
          "审批已超时",
        );
        this.options.onTimeout?.(approval.approvalId, approval.runId);
        count += 1;
      } catch {
        /* another actor decided first */
      }
    }
    return count;
  }
}
