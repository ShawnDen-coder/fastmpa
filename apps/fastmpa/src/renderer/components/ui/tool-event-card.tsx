import type { ApplicationEvent } from "../../../shared/contracts/application.js";
import { ApprovalPanel } from "../workbench/approval-panel.js";

export function ToolEventCard({
  event,
  onDetails,
  onApprove,
  onReject,
  onRetry,
}: {
  readonly event: ApplicationEvent;
  readonly onDetails: (runId: string) => void;
  readonly onApprove: (runId: string, approvalId: string) => void;
  readonly onReject: (runId: string, approvalId: string) => void;
  readonly onRetry: (runId: string, approvalId: string) => void;
}): React.JSX.Element | null {
  if (event.type === "tool.started")
    return (
      <div className="tool-card">
        <span>Tool</span>
        <strong>{event.toolName}</strong>
        <small>Running</small>
      </div>
    );
  if (event.type === "tool.completed")
    return (
      <div className="tool-card">
        <span>Tool</span>
        <strong>{event.toolCallId.slice(0, 8)}</strong>
        <small>{event.isError ? "Failed" : "Completed"}</small>
      </div>
    );
  if (event.type !== "tool.approval_required") return null;
  return (
    <ApprovalPanel
      request={{
        runId: event.runId,
        approvalId: event.approvalId,
        toolName: event.toolCallId.slice(0, 8),
        status: "pending",
      }}
      onApprove={() => onApprove(event.runId, event.approvalId)}
      onReject={() => onReject(event.runId, event.approvalId)}
      onReviewDiff={() => onDetails(event.runId)}
      onRetry={() => onRetry(event.runId, event.approvalId)}
    />
  );
}
