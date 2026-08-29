import type {
  AgentRun,
  LeaseRuntimeWorker,
  PersistedTurnInput,
  RunLeaseStore,
} from "@shawnden-coder/agent-runtime";
import type { PipelineResult, ToolPipeline } from "tool-pipeline";

export interface ApprovalResumeOptions {
  readonly pipeline: ToolPipeline;
  readonly store: RunLeaseStore;
  readonly worker: Pick<LeaseRuntimeWorker, "resumeRun">;
}

export type ApprovalResumeResult = {
  readonly approval: PipelineResult;
  readonly run?: AgentRun;
};

/** 将一次已持久化的 waiting Run 与 Pipeline 审批绑定，并在批准后恢复执行。 */
export class ApprovalResumer {
  public constructor(private readonly options: ApprovalResumeOptions) {}

  public async approveAndResume(
    runId: string,
    approvalId: string,
  ): Promise<ApprovalResumeResult> {
    const run = await this.options.store.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.status !== "waiting")
      throw new Error(`Run is not waiting for approval: ${runId}`);
    if (run.error?.code !== "approval_required")
      throw new Error(`Run has no pending approval: ${runId}`);
    const persistedApprovalId = getApprovalId(run.error.details);
    if (persistedApprovalId !== approvalId)
      throw new Error(`Approval does not belong to Run: ${runId}`);
    if (!run.input) throw new Error(`Run has no persisted input: ${runId}`);

    const approval = await this.options.pipeline.approve(approvalId);
    if (approval.status !== "completed") return { approval };

    const turn: PersistedTurnInput = {
      ...run.input.turn,
      messages: [
        ...run.input.turn.messages,
        {
          role: "user",
          content: `用户已批准审批 ${approvalId}，请继续执行原任务。`,
        },
      ],
    };
    const resumed = await this.options.worker.resumeRun(runId, turn);
    return { approval, ...(resumed === undefined ? {} : { run: resumed }) };
  }
}

function getApprovalId(details: unknown): string | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const approvalId = (details as { approvalId?: unknown }).approvalId;
  return typeof approvalId === "string" ? approvalId : undefined;
}
