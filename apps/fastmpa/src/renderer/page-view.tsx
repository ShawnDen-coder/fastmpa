import { useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import type {
  ApplicationEvent,
  ApplicationLogEntry,
  ApplicationSnapshot,
} from "../application.js";
import type { DesktopInfo } from "../shared/desktop-api.js";

interface PageViewProps {
  readonly page: string;
  readonly snapshot?: ApplicationSnapshot;
  readonly logs: readonly ApplicationLogEntry[];
  readonly events: readonly ApplicationEvent[];
  readonly desktopInfo?: DesktopInfo;
  readonly onRunSelect?: (runId: string) => void;
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
  onSelect,
}: {
  readonly run: ApplicationSnapshot["runs"][number];
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

function LogPage({
  logs,
}: {
  readonly logs: readonly ApplicationLogEntry[];
}): React.JSX.Element {
  const [level, setLevel] = useState<"all" | ApplicationLogEntry["level"]>(
    "all",
  );
  const [workspaceId, setWorkspaceId] = useState("all");
  const [conversationId, setConversationId] = useState("all");
  const [runId, setRunId] = useState("all");
  const [followLatest, setFollowLatest] = useState(true);
  const contextValues = (field: string): string[] =>
    [...new Set(logs.map((entry) => entry.context[field]).filter(Boolean))].map(
      String,
    );
  const filteredLogs = useMemo(
    () =>
      logs.filter((entry) => {
        const context = entry.context;
        return (
          (level === "all" || entry.level === level) &&
          (workspaceId === "all" || String(context.workspaceId) === workspaceId) &&
          (conversationId === "all" || String(context.conversationId) === conversationId) &&
          (runId === "all" || String(context.runId) === runId)
        );
      }),
    [conversationId, level, logs, runId, workspaceId],
  );
  const filter = (
    label: string,
    value: string,
    setValue: (value: string) => void,
    values: readonly string[],
  ): React.JSX.Element => (
    <label>
      {label}
      <select value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="all">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item.slice(0, 12)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="logs-page">
      <div className="logs-toolbar">
        <span>Recent application logs ({filteredLogs.length})</span>
        <div className="log-controls">
          <label>
            Level
            <select
              value={level}
              onChange={(event) =>
                setLevel(
                  event.target.value as "all" | ApplicationLogEntry["level"],
                )
              }
            >
              <option value="all">All</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </label>
          {filter("Workspace", workspaceId, setWorkspaceId, contextValues("workspaceId"))}
          {filter(
            "Conversation",
            conversationId,
            setConversationId,
            contextValues("conversationId"),
          )}
          {filter("Run", runId, setRunId, contextValues("runId"))}
          <label className="follow-toggle">
            <input
              type="checkbox"
              checked={followLatest}
              onChange={(event) => setFollowLatest(event.target.checked)}
            />
            Follow latest
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void window.fastMpa.desktop.revealLogFile()}
          >
            Open log file
          </button>
        </div>
      </div>
      <div className="log-items">
        <Virtuoso
          data={filteredLogs}
          followOutput={followLatest ? "smooth" : false}
          itemContent={(_index, entry) => (
            <article className={`log-item level-${entry.level}`}>
              <span>{entry.level}</span>
              <strong>{entry.component}</strong>
              <p>{entry.message}</p>
              <time>{entry.timestamp}</time>
            </article>
          )}
        />
      </div>
    </div>
  );
}

export function PageView({
  page,
  snapshot,
  logs,
  events,
  desktopInfo,
  onRunSelect,
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
  if (page === "Schedules")
    return (
      <div className="page-grid">
        {(snapshot?.schedules ?? []).map((schedule) => (
          <ScheduleCard key={schedule.id} schedule={schedule} />
        ))}
      </div>
    );
  if (page === "Logs")
    return <LogPage logs={logs} />;
  return (
    <div className="settings-grid">
      <Card
        label="Model"
        value={desktopInfo?.model ?? "Loading"}
        detail="Configured in the Main process"
      />
      <Card
        label="Database"
        value="SQLite"
        detail="Stored in the FastMPA user data directory"
      />
      <Card
        label="Version"
        value={desktopInfo?.version ?? "Loading"}
        detail={
          desktopInfo
            ? `${desktopInfo.platform} · ${desktopInfo.arch}`
            : "FastMPA Desktop"
        }
      />
      <Card label="Log level" value={desktopInfo?.logLevel ?? "Loading"} />
      <Card
        label="Database path"
        value={desktopInfo?.databasePath ?? "Loading"}
      />
      <Card label="Log path" value={desktopInfo?.logPath ?? "Loading"} />
      <div className="settings-action">
        <button
          type="button"
          className="secondary-button"
          onClick={() => void window.fastMpa.desktop.revealDataDirectory()}
        >
          Open data directory
        </button>
      </div>
    </div>
  );
}
