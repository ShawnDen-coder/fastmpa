import { useState } from "react";
import type { ApplicationEvent } from "../../../shared/contracts/application.js";

export function ToolEventCard({
  event,
  onDetails,
}: {
  readonly event: ApplicationEvent;
  readonly onDetails: (runId: string) => void;
}): React.JSX.Element | null {
  const [action, setAction] = useState<"approve" | "reject" | "details">(
    "approve",
  );
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
  const approvalEvent = event;
  const execute = (): void => {
    if (action === "details") {
      onDetails(approvalEvent.runId);
      return;
    }
    void window.fastMpa.application.dispatch({
      type: action,
      runId: approvalEvent.runId,
      approvalId: approvalEvent.approvalId,
    });
  };
  return (
    <fieldset
      className="tool-card approval-inline"
      aria-label="Tool approval"
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.ctrlKey && keyboardEvent.key.toLowerCase() === "a") {
          keyboardEvent.preventDefault();
          setAction("approve");
        } else if (
          keyboardEvent.ctrlKey &&
          keyboardEvent.key.toLowerCase() === "x"
        ) {
          keyboardEvent.preventDefault();
          setAction("reject");
        } else if (keyboardEvent.key === "ArrowLeft") {
          setAction((current) =>
            current === "approve"
              ? "details"
              : current === "reject"
                ? "approve"
                : "reject",
          );
        } else if (keyboardEvent.key === "ArrowRight") {
          setAction((current) =>
            current === "approve"
              ? "reject"
              : current === "reject"
                ? "details"
                : "approve",
          );
        } else if (keyboardEvent.key === "Enter") {
          keyboardEvent.preventDefault();
          execute();
        }
      }}
    >
      <span>Approval required</span>
      <strong>{event.toolCallId.slice(0, 8)}</strong>
      <small>Review this tool call before the run can continue.</small>
      <div className="run-actions">
        <button
          type="button"
          className={
            action === "approve" ? "approve-button selected" : "approve-button"
          }
          onClick={() => {
            setAction("approve");
            execute();
          }}
        >
          Approve
        </button>
        <button
          type="button"
          className={
            action === "reject" ? "reject-button selected" : "reject-button"
          }
          onClick={() => {
            setAction("reject");
            execute();
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className={
            action === "details"
              ? "secondary-button selected"
              : "secondary-button"
          }
          onClick={() => {
            setAction("details");
            onDetails(event.runId);
          }}
        >
          Details
        </button>
      </div>
    </fieldset>
  );
}
