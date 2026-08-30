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
            <Card
              key={run.runId}
              label={run.phase}
              value={run.status}
              detail={`${run.runId.slice(0, 8)} · attempt ${run.attempt}`}
            />
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
          <Card
            key={schedule.id}
            label="Schedule"
            value={schedule.instruction}
            detail={`${schedule.enabled === false ? "paused" : "active"} · ${schedule.intervalMs}ms`}
          />
        ))}
      </div>
    );
  if (page === "Logs")
    return (
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
