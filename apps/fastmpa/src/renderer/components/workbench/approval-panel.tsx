import type { ApprovalRequestViewModel } from "./types.js";

export function ApprovalPanel({
  request,
  onApprove,
  onReject,
  onReviewDiff,
  onRetry,
}: {
  readonly request: ApprovalRequestViewModel;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onReviewDiff: () => void;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const busy = request.status === "submitting";
  const terminal = request.status === "approved" || request.status === "rejected";
  return (
    <section className="tool-card approval-inline" aria-label="审批请求">
      <div className="approval-heading">
        <span>需要审批</span>
        <strong>{request.toolName}</strong>
      </div>
      {(request.operation || request.target) && (
        <p>{[request.operation, request.target].filter(Boolean).join(" · ")}</p>
      )}
      {request.error && <p className="approval-error" role="alert">{request.error}</p>}
      {terminal ? (
        <p role="status">{request.status === "approved" ? "已批准" : "已拒绝"}</p>
      ) : (
        <div className="run-actions">
          <button type="button" className="approve-button" disabled={busy} onClick={onApprove}>批准</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={onReviewDiff}>查看变更</button>
          <button type="button" className="reject-button" disabled={busy} onClick={onReject}>拒绝</button>
          {request.status === "failed" && <button type="button" className="secondary-button" onClick={onRetry}>重试</button>}
        </div>
      )}
      {busy && <small role="status" aria-live="polite">正在提交决定…</small>}
    </section>
  );
}
