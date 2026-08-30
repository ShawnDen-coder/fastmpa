import type {
  ApplicationEvent,
  ApplicationLogEntry,
  ApplicationSnapshot,
} from "../application.js";

interface PageViewProps {
  readonly page: string;
  readonly snapshot?: ApplicationSnapshot;
  readonly logs: readonly ApplicationLogEntry[];
  readonly events: readonly ApplicationEvent[];
}

function Card({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}): React.JSX.Element {
  return (
    <article className="info-card">
      <span className="card-label">{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function approvalId(
  run: ApplicationSnapshot["runs"][number],
): string | undefined {
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
}: {
  readonly run: ApplicationSnapshot["runs"][number];
}): React.JSX.Element {
  const pendingApprovalId =
    run.status === "waiting" ? approvalId(run) : undefined;
  const canCancel = ["queued", "running", "retrying", "waiting"].includes(
    run.status,
  );
  const canRetry = ["failed", "cancelled", "interrupted"].includes(run.status);
  return (
    <article className="run-card">
      <Card
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

function ScheduleCard({
  schedule,
}: {
  readonly schedule: ApplicationSnapshot["schedules"][number];
}): React.JSX.Element {
  const action: "schedule.pause" | "schedule.resume" =
    schedule.enabled === false ? "schedule.resume" : "schedule.pause";
  return (
    <article className="run-card">
      <Card
        label="Schedule"
        value={schedule.instruction}
        detail={`${schedule.enabled === false ? "paused" : "active"} · ${schedule.intervalMs}ms`}
      />
      <div className="run-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void window.fastMpa.application.dispatch({
              type: action,
              workspaceId: schedule.workspaceId,
              scheduleId: schedule.id,
            })
          }
        >
          {schedule.enabled === false ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="secondary-button danger-button"
          onClick={() =>
            void window.fastMpa.application.dispatch({
              type: "schedule.delete",
              workspaceId: schedule.workspaceId,
              scheduleId: schedule.id,
            })
          }
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export function PageView({
  page,
  snapshot,
  logs,
  events,
}: PageViewProps): React.JSX.Element {
  if (page === "Agents")
    return (
      <div className="page-grid">
        {(snapshot?.participants ?? [])
          .filter((participant) => participant.kind === "agent")
          .map((participant) => (
            <Card
              key={participant.id}
              label="Agent"
              value={participant.name}
              detail={participant.agent?.model ?? "Model not configured"}
            />
          ))}
      </div>
    );
  if (page === "Runs")
    return (
      <div className="run-page">
        <div className="page-grid">
          {(snapshot?.runs ?? []).map((run) => (
            <RunCard key={run.runId} run={run} />
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
  if (page === "Schedules")
    return (
      <div className="page-grid">
        {(snapshot?.schedules ?? []).map((schedule) => (
          <ScheduleCard key={schedule.id} schedule={schedule} />
        ))}
      </div>
    );
  if (page === "Logs")
    return (
      <div className="logs-page">
        <div className="logs-toolbar">
          <span>Recent application logs</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void window.fastMpa.desktop.revealLogFile()}
          >
            Open log file
          </button>
        </div>
        <div className="log-items">
          {logs.map((entry) => (
            <article
              className={`log-item level-${entry.level}`}
              key={entry.sequence}
            >
              <span>{entry.level}</span>
              <strong>{entry.component}</strong>
              <p>{entry.message}</p>
              <time>{entry.timestamp}</time>
            </article>
          ))}
        </div>
      </div>
    );
  return (
    <div className="settings-grid">
      <Card
        label="Model"
        value="OpenRouter"
        detail="Configured in the Main process"
      />
      <Card
        label="Database"
        value="SQLite"
        detail="Stored in the FastMPA user data directory"
      />
      <Card label="Version" value="Desktop 0.1.0" detail="FastMPA" />
    </div>
  );
}
