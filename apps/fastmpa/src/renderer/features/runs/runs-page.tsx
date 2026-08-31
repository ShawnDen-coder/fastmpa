import type { ApplicationEvent } from "../../../shared/contracts/application.js";
import type { RunSnapshot } from "../../../shared/contracts/snapshot.js";
import { InfoCard } from "../../components/ui/info-card.js";

function approvalId(run: NonNullable<RunSnapshot["run"]>): string | undefined {
  const details = run.error?.details;
  if (
    typeof details !== "object" ||
    details === null ||
    !("approvalId" in details)
  )
    return undefined;
  const value = details.approvalId;
  return typeof value === "string" ? value : undefined;
}

function RunCard({
  run,
  onSelect,
}: {
  readonly run: NonNullable<RunSnapshot["run"]>;
  readonly onSelect?: (runId: string) => void;
}): React.JSX.Element {
  const pendingApprovalId =
    run.status === "waiting" ? approvalId(run) : undefined;
  const canCancel = ["queued", "running", "retrying", "waiting"].includes(
    run.status,
  );
  const canRetry = ["failed", "cancelled", "interrupted"].includes(run.status);
  return (
    <article className="run-card">
      <button
        type="button"
        className="run-select"
        onClick={() => onSelect?.(run.runId)}
      >
        Inspect run
      </button>
      <InfoCard
        label={run.phase}
        value={run.status}
        detail={`${run.runId.slice(0, 8)} · attempt ${run.attempt}`}
      />
      {pendingApprovalId && (
        <div className="approval-card">
          <strong>Approval required</strong>
          <small>{pendingApprovalId.slice(0, 8)}</small>
          <div>
            <button
              type="button"
              className="approve-button"
              onClick={() =>
                void window.fastMpa.application.dispatch({
                  type: "approve",
                  runId: run.runId,
                  approvalId: pendingApprovalId,
                })
              }
            >
              Approve
            </button>
            <button
              type="button"
              className="reject-button"
              onClick={() =>
                void window.fastMpa.application.dispatch({
                  type: "reject",
                  runId: run.runId,
                  approvalId: pendingApprovalId,
                })
              }
            >
              Reject
            </button>
          </div>
        </div>
      )}
      <div className="run-actions">
        {canRetry && (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void window.fastMpa.application.dispatch({
                type: "retry",
                runId: run.runId,
              })
            }
          >
            Retry
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void window.fastMpa.application.dispatch({
                type: "cancel",
                runId: run.runId,
              })
            }
          >
            Cancel
          </button>
        )}
      </div>
    </article>
  );
}

export function RunsPage({
  runs,
  events,
  onRunSelect,
}: {
  readonly runs: readonly NonNullable<RunSnapshot["run"]>[];
  readonly events: readonly ApplicationEvent[];
  readonly onRunSelect?: (runId: string) => void;
}): React.JSX.Element {
  return (
    <div className="run-page">
      <div className="page-grid">
        {runs.map((run) => (
          <RunCard key={run.runId} run={run} onSelect={onRunSelect} />
        ))}
      </div>
      <div className="event-timeline">
        {events.map((event) => (
          <div
            className="event-row"
            key={`${event.runId}-${event.type}-${JSON.stringify(event)}`}
          >
            <span>{event.type}</span>
            <small>{event.runId.slice(0, 8)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
