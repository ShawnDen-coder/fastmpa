import { useEffect, useState } from "react";
import type {
  ApplicationEvent,
  ApplicationSnapshot,
} from "../../../shared/contracts/application.js";
import type { PersistedRuntimeEvent } from "../../../shared/contracts/snapshot.js";
import { ToolEventCard } from "../../components/ui/tool-event-card.js";

function runDuration(run: {
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}): string {
  const start = Date.parse(run.startedAt ?? run.createdAt);
  const end = Date.parse(run.finishedAt ?? new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return "—";
  return `${Math.round((end - start) / 1000)}s`;
}

export function RunInspector({
  snapshot,
  events,
  runId,
  onClose,
}: {
  readonly snapshot: ApplicationSnapshot;
  readonly events: readonly ApplicationEvent[];
  readonly runId: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [persistedEvents, setPersistedEvents] = useState<
    readonly PersistedRuntimeEvent[]
  >([]);
  const run = snapshot.runs.find((item) => item.runId === runId);
  const runEvents = events.filter((event) => event.runId === runId);
  useEffect(() => {
    let active = true;
    void window.fastMpa.application.getRunSnapshot(runId).then((next) => {
      if (active) setPersistedEvents(next.events);
    });
    return () => {
      active = false;
    };
  }, [runId]);
  const toolEvents = runEvents.filter(
    (event) =>
      event.type === "tool.started" ||
      event.type === "tool.approval_required" ||
      event.type === "tool.completed",
  );
  return (
    <aside className="inspector-pane" aria-label="Run inspector">
      <div className="pane-heading">
        <div>
          <p className="eyebrow">Inspector</p>
          <h2>Run details</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close inspector"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {!run ? (
        <p className="empty-state">Run unavailable.</p>
      ) : (
        <div className="inspector-content">
          <div className="inspector-status">
            <span>{run.phase}</span>
            <strong>{run.status}</strong>
          </div>
          <div className="run-actions">
            {["failed", "cancelled", "interrupted"].includes(run.status) && (
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
            {["queued", "running", "retrying", "waiting"].includes(
              run.status,
            ) && (
              <button
                type="button"
                className="secondary-button danger-button"
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
          <dl>
            <dt>Run ID</dt>
            <dd>{run.runId}</dd>
            <dt>Attempt</dt>
            <dd>{run.attempt}</dd>
            <dt>Duration</dt>
            <dd>{runDuration(run)}</dd>
            <dt>Agent</dt>
            <dd>{run.context?.agentId ?? "—"}</dd>
            <dt>Workspace</dt>
            <dd>{run.context?.workspaceId ?? "—"}</dd>
            <dt>Conversation</dt>
            <dd>{run.context?.conversationId ?? "—"}</dd>
            <dt>Trigger</dt>
            <dd>{run.context?.trigger ?? "—"}</dd>
            <dt>Source</dt>
            <dd>
              {run.context?.sourceRef
                ? `${run.context.sourceRef.type}:${run.context.sourceRef.id}`
                : "—"}
            </dd>
          </dl>
          {run.error && (
            <div className="inspector-error" role="alert">
              <strong>{run.error.code ?? run.error.name}</strong>
              <span>{run.error.message}</span>
              <small>
                {run.error.retryable ? "Retryable" : "Not retryable"}
              </small>
            </div>
          )}
          {toolEvents.length > 0 && (
            <>
              <h3>Tool calls</h3>
              <div className="inspector-tools">
                {toolEvents.map((event) => (
                  <ToolEventCard
                    key={`${event.runId}-${event.type}-${JSON.stringify(event)}`}
                    event={event}
                    onDetails={onClose}
                  />
                ))}
              </div>
            </>
          )}
          <h3>Lifecycle events</h3>
          <div className="inspector-events">
            {persistedEvents.map((event) => (
              <div key={`${event.runId}-${event.sequence}`}>
                <strong>{event.type}</strong>
                <small>{event.occurredAt}</small>
              </div>
            ))}
            {runEvents.map((event) => (
              <div
                key={`${event.runId}-${event.type}-${JSON.stringify(event)}`}
              >
                <strong>{event.type}</strong>
                <small>{JSON.stringify(event)}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
