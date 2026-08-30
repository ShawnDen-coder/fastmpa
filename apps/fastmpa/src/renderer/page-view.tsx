import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import type {
  ApplicationEvent,
  ApplicationLogEntry,
  ApplicationSnapshot,
} from "../application/application.js";
import type { DesktopInfo } from "../shared/desktop-api.js";
import { useLogStore } from "./stores.js";

interface PageViewProps {
  readonly page: string;
  readonly snapshot?: ApplicationSnapshot;
  readonly logs: readonly ApplicationLogEntry[];
  readonly events: readonly ApplicationEvent[];
  readonly desktopInfo?: DesktopInfo;
  readonly workspaceId?: string;
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

function ScheduleCreateCard({
  workspaceId,
  agents,
}: {
  readonly workspaceId?: string;
  readonly agents: readonly ApplicationSnapshot["participants"][number][];
}): React.JSX.Element {
  const [instruction, setInstruction] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");

  useEffect(() => {
    if (!agents.some((agent) => agent.id === agentId))
      setAgentId(agents[0]?.id ?? "");
  }, [agentId, agents]);

  const submit = (): void => {
    const intervalMs = Number(intervalMinutes) * 60_000;
    if (
      !workspaceId ||
      !agentId ||
      !instruction.trim() ||
      !Number.isFinite(intervalMs) ||
      intervalMs < 60_000
    )
      return;
    void window.fastMpa.application.dispatch({
      type: "schedule.create",
      workspaceId,
      agentId,
      instruction: instruction.trim(),
      intervalMs,
    });
    setInstruction("");
  };

  return (
    <article className="schedule-create-card">
      <div>
        <p className="eyebrow">New schedule</p>
        <h3>Run an instruction periodically</h3>
      </div>
      <label>
        Instruction
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Review open tasks"
          rows={3}
        />
      </label>
      <div className="schedule-form-row">
        <label>
          Agent
          <select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
          >
            {agents.length === 0 && (
              <option value="">No agent available</option>
            )}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Every (minutes)
          <input
            type="number"
            min="1"
            step="1"
            value={intervalMinutes}
            onChange={(event) => setIntervalMinutes(event.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="send-button"
        disabled={!workspaceId || !agentId || !instruction.trim()}
        onClick={submit}
      >
        Create schedule
      </button>
    </article>
  );
}

function LogPage({
  logs,
}: {
  readonly logs: readonly ApplicationLogEntry[];
}): React.JSX.Element {
  const level = useLogStore((state) => state.level);
  const workspaceId = useLogStore((state) => state.workspaceId);
  const conversationId = useLogStore((state) => state.conversationId);
  const runId = useLogStore((state) => state.runId);
  const component = useLogStore((state) => state.component);
  const followLatest = useLogStore((state) => state.followLatest);
  const setLevel = useLogStore((state) => state.setLevel);
  const setWorkspaceId = useLogStore((state) => state.setWorkspaceId);
  const setConversationId = useLogStore((state) => state.setConversationId);
  const setRunId = useLogStore((state) => state.setRunId);
  const setComponent = useLogStore((state) => state.setComponent);
  const setFollowLatest = useLogStore((state) => state.setFollowLatest);
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
          (workspaceId === "all" ||
            String(context.workspaceId) === workspaceId) &&
          (conversationId === "all" ||
            String(context.conversationId) === conversationId) &&
          (runId === "all" || String(context.runId) === runId) &&
          (component === "all" || entry.component === component)
        );
      }),
    [component, conversationId, level, logs, runId, workspaceId],
  );
  const componentValues = contextValues("component");
  useEffect(() => {
    const cycleComponent = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== "v" ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const values = ["all", ...componentValues];
      const index = values.indexOf(component);
      setComponent(values[(index + 1) % values.length] ?? "all");
    };
    window.addEventListener("keydown", cycleComponent);
    return () => window.removeEventListener("keydown", cycleComponent);
  }, [component, componentValues, setComponent]);
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
          {filter(
            "Workspace",
            workspaceId,
            setWorkspaceId,
            contextValues("workspaceId"),
          )}
          {filter(
            "Conversation",
            conversationId,
            setConversationId,
            contextValues("conversationId"),
          )}
          {filter("Run", runId, setRunId, contextValues("runId"))}
          {filter("Component", component, setComponent, componentValues)}
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
  workspaceId,
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
      <div className="schedule-page">
        <ScheduleCreateCard
          workspaceId={workspaceId}
          agents={(snapshot?.participants ?? []).filter(
            (participant) => participant.kind === "agent",
          )}
        />
        <div className="page-grid">
          {(snapshot?.schedules ?? []).map((schedule) => (
            <ScheduleCard key={schedule.id} schedule={schedule} />
          ))}
        </div>
      </div>
    );
  if (page === "Logs") return <LogPage logs={logs} />;
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
