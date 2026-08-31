import type { ApplicationEvent } from "../../../shared/contracts/application.js";
import type { RunSnapshot } from "../../../shared/contracts/snapshot.js";
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
  readonly snapshot: RunSnapshot;
  readonly events: readonly ApplicationEvent[];
  readonly runId: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const persistedEvents = snapshot.events;
  const run = snapshot.run;
  const runEvents = events.filter((event) => event.runId === runId);
  const toolEvents = runEvents.filter(
    (event) => event.type === "tool.started" || event.type === "tool.completed",
  );
  return (
    <aside className="inspector-pane" aria-label="运行检查器">
      <div className="pane-heading">
        <div>
          <p className="eyebrow">运行检查器</p>
          <h2>运行详情</h2>
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
        <p className="empty-state">运行不可用。</p>
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
                重试
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
                取消
              </button>
            )}
          </div>
          <dl>
            <dt>运行 ID</dt>
            <dd>{run.runId}</dd>
            <dt>尝试次数</dt>
            <dd>{run.attempt}</dd>
            <dt>耗时</dt>
            <dd>{runDuration(run)}</dd>
            <dt>Agent</dt>
            <dd>{run.context?.agentId ?? "—"}</dd>
            <dt>工作区</dt>
            <dd>{run.context?.workspaceId ?? "—"}</dd>
            <dt>对话</dt>
            <dd>{run.context?.conversationId ?? "—"}</dd>
            <dt>触发方式</dt>
            <dd>{run.context?.trigger ?? "—"}</dd>
            <dt>来源</dt>
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
              <h3>工具调用</h3>
              <div className="inspector-tools">
                {toolEvents.map((event) => (
                  <ToolEventCard
                    key={`${event.runId}-${event.type}-${JSON.stringify(event)}`}
                    event={event}
                    onDetails={onClose}
                    onApprove={() => undefined}
                    onReject={() => undefined}
                    onRetry={() => undefined}
                  />
                ))}
              </div>
            </>
          )}
          <h3>生命周期事件</h3>
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
