import type { ApplicationEvent } from "../../../shared/contracts/application.js";
import type { RunSnapshot } from "../../../shared/contracts/snapshot.js";
import { InfoCard } from "../../components/ui/info-card.js";

function RunCard({
  run,
  onSelect,
}: {
  readonly run: NonNullable<RunSnapshot["run"]>;
  readonly onSelect?: (runId: string) => void;
}): React.JSX.Element {
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
        查看运行
      </button>
      <InfoCard
        label={run.phase}
        value={run.status}
        detail={`${run.runId.slice(0, 8)} · attempt ${run.attempt}`}
      />
      {run.status === "waiting" && (
        <p className="approval-card">等待审批 · 请前往对应对话处理</p>
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
            重试
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
            取消
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
