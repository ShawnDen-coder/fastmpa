import type { AgentRun } from "@shawnden-coder/agent-runtime";
import type { AgentInput, AgentPatch, WorkspaceRepository } from "workspace";
import type { ApplicationCommand, CommandResult } from "../application.js";

type AgentCommand = Extract<
  ApplicationCommand,
  { type: "agent.create" | "agent.update" | "agent.activate" | "agent.archive" }
>;

export async function handleAgentCommand(
  repository: WorkspaceRepository,
  command: AgentCommand,
  listRuns: () => Promise<{ runs: readonly AgentRun[] }>,
  normalizeModelKey: (modelKey: string) => string,
  validateAgentInput: (input: AgentInput) => void,
  validateAgentPatch: (patch: AgentPatch) => void,
  publishWorkspace: (workspaceId: string) => Promise<void>,
): Promise<CommandResult> {
  if (command.type === "agent.create") {
    if (!repository.getWorkspace(command.workspaceId))
      throw new Error(`Workspace not found: ${command.workspaceId}`);
    const input = {
      ...command.input,
      modelKey: normalizeModelKey(command.input.modelKey),
    };
    validateAgentInput(input);
    const participant = repository.createAgent(command.workspaceId, input);
    await publishWorkspace(command.workspaceId);
    return { participant, created: true };
  }

  if (command.type === "agent.update") {
    const patch = command.patch.modelKey
      ? {
          ...command.patch,
          modelKey: normalizeModelKey(command.patch.modelKey),
        }
      : command.patch;
    validateAgentPatch(patch);
    const participant = repository.updateAgent(
      command.workspaceId,
      command.agentId,
      patch,
    );
    await publishWorkspace(command.workspaceId);
    return { participant };
  }

  if (command.type === "agent.archive") {
    const activeRuns = (await listRuns()).runs.filter(
      (run) =>
        run.context?.workspaceId === command.workspaceId &&
        run.context.agentId === command.agentId &&
        ["queued", "running", "retrying", "waiting", "blocked"].includes(
          run.status,
        ),
    );
    if (activeRuns.length > 0)
      throw new Error("Agent has active or approval-waiting Runs");
  }

  const participant = repository.setAgentStatus(
    command.workspaceId,
    command.agentId,
    command.type === "agent.activate" ? "active" : "inactive",
  );
  if (command.type === "agent.archive") {
    const groups = repository
      .listConversations(command.workspaceId)
      .filter(
        (conversation) =>
          conversation.kind === "group" &&
          conversation.participantIds.includes(command.agentId),
      );
    if (
      groups.some(
        (conversation) =>
          conversation.participantIds.filter(
            (id) => id !== "human" && id !== command.agentId,
          ).length === 0,
      )
    )
      throw new Error("Cannot archive the only Agent in a group conversation");
    for (const conversation of groups) {
      const participantIds = conversation.participantIds.filter(
        (id) => id !== command.agentId,
      );
      repository.saveConversation({
        ...conversation,
        participantIds,
        routing:
          conversation.routing?.fallbackAgentId === command.agentId
            ? {
                ...conversation.routing,
                fallbackAgentId: participantIds.find(
                  (id) => id !== "human",
                ) as string,
              }
            : conversation.routing,
      });
    }
  }
  await publishWorkspace(command.workspaceId);
  return { participant };
}
