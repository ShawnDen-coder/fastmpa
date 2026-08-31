import { randomUUID } from "node:crypto";
import type { ScheduleRunner } from "@shawnden-coder/agent-runtime";
import type { WorkspaceRepository } from "workspace";
import type { ApplicationCommand, CommandResult } from "../application.js";

type ScheduleCommand = Extract<
  ApplicationCommand,
  {
    type:
      | "schedule.create"
      | "schedule.pause"
      | "schedule.resume"
      | "schedule.delete";
  }
>;

export async function handleScheduleCommand(
  repository: WorkspaceRepository,
  scheduleRunner: ScheduleRunner,
  command: ScheduleCommand,
  publishWorkspace: (workspaceId: string) => Promise<void>,
): Promise<CommandResult> {
  if (command.type === "schedule.create") {
    if (!repository.getWorkspace(command.workspaceId))
      throw new Error(`Workspace not found: ${command.workspaceId}`);
    const agent = repository.getParticipant(
      command.workspaceId,
      command.agentId,
    );
    if (agent?.kind !== "agent" || agent.status !== "active")
      throw new Error(`Active Agent not found: ${command.agentId}`);
    if (!Number.isFinite(command.intervalMs) || command.intervalMs < 60_000)
      throw new Error("Schedule interval must be at least one minute");
    const id = command.scheduleId ?? randomUUID();
    scheduleRunner.upsert({
      id,
      workspaceId: command.workspaceId,
      agentId: command.agentId,
      instruction: command.instruction,
      intervalMs: command.intervalMs,
      nextRunAt: Date.now() + command.intervalMs,
      createdAt: new Date().toISOString(),
      enabled: true,
    });
    await publishWorkspace(command.workspaceId);
    return {};
  }
  const schedule = repository.getSchedule(
    command.workspaceId,
    command.scheduleId,
  );
  if (!schedule) throw new Error(`Schedule not found: ${command.scheduleId}`);
  if (command.type === "schedule.delete")
    repository.deleteSchedule(schedule.workspaceId, schedule.id);
  else
    repository.saveSchedule({
      ...schedule,
      enabled: command.type === "schedule.resume",
    });
  await publishWorkspace(command.workspaceId);
  return {};
}
