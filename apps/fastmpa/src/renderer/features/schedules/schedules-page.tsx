import { useEffect, useState } from "react";
import type { ShellSnapshot } from "../../../shared/contracts/snapshot.js";
import { InfoCard } from "../../components/ui/info-card.js";

function ScheduleCard({
  schedule,
}: {
  readonly schedule: ShellSnapshot["schedules"][number];
}): React.JSX.Element {
  const action: "schedule.pause" | "schedule.resume" =
    schedule.enabled === false ? "schedule.resume" : "schedule.pause";
  return (
    <article className="run-card">
      <InfoCard
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
  readonly agents: ShellSnapshot["participants"];
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

export function SchedulesPage({
  workspaceId,
  agents,
  schedules,
}: {
  readonly workspaceId?: string;
  readonly agents: ShellSnapshot["participants"];
  readonly schedules: ShellSnapshot["schedules"];
}): React.JSX.Element {
  return (
    <div className="schedule-page">
      <ScheduleCreateCard workspaceId={workspaceId} agents={agents} />
      <div className="page-grid">
        {schedules.map((schedule) => (
          <ScheduleCard key={schedule.id} schedule={schedule} />
        ))}
      </div>
    </div>
  );
}
