import { randomUUID } from "node:crypto";
import type { AgentRun } from "@shawnden-coder/agent-runtime";
import type { Conversation, WorkspaceRepository } from "workspace";
import type { ApplicationCommand, CommandResult } from "../application.js";

type ConversationCommand = Extract<
  ApplicationCommand,
  {
    type:
      | "conversation.direct.open"
      | "conversation.group.create"
      | "conversation.group.rename"
      | "conversation.member.add"
      | "conversation.member.remove"
      | "conversation.create";
  }
>;

export async function handleConversationCommand(
  repository: WorkspaceRepository,
  command: ConversationCommand,
  models: ReadonlyMap<string, unknown>,
  listRuns: () => Promise<{ runs: readonly AgentRun[] }>,
  ensureOwner: (workspaceId: string) => void,
  publishWorkspace: (workspaceId: string) => Promise<void>,
): Promise<CommandResult> {
  if (command.type === "conversation.direct.open") {
    ensureOwner(command.workspaceId);
    const agent = repository.getParticipant(
      command.workspaceId,
      command.agentId,
    );
    if (agent?.kind !== "agent" || agent.status !== "active")
      throw new Error(`Active Agent not found: ${command.agentId}`);
    const existing = repository.findDirectConversation(
      command.workspaceId,
      command.agentId,
    );
    if (existing) return { conversationId: existing.id, created: false };
    const id = command.conversationId ?? randomUUID();
    if (repository.getConversation(command.workspaceId, id))
      throw new Error(`Conversation already exists: ${id}`);
    repository.saveConversation({
      id,
      workspaceId: command.workspaceId,
      kind: "direct",
      title: agent.name,
      participantIds: ["human", command.agentId],
      createdAt: new Date().toISOString(),
    });
    await publishWorkspace(command.workspaceId);
    return { conversationId: id, created: true };
  }

  if (command.type === "conversation.group.create") {
    const title = command.title.trim();
    if (!title) throw new Error("Group conversation title is required");
    const agentIds = [...new Set(command.agentIds)];
    if (agentIds.length === 0)
      throw new Error("Group conversation needs an Agent");
    ensureOwner(command.workspaceId);
    const agents = agentIds.map((id) =>
      repository.getParticipant(command.workspaceId, id),
    );
    if (
      agents.some(
        (agent) => agent?.kind !== "agent" || agent.status !== "active",
      )
    )
      throw new Error("Group conversation can only include active Agents");
    const fallbackAgentId = command.routing?.fallbackAgentId ?? agentIds[0];
    if (!agentIds.includes(fallbackAgentId))
      throw new Error("Fallback Agent must be a group member");
    const routerModelKey = command.routing?.routerModelKey ?? "default";
    if (!models.has(routerModelKey))
      throw new Error(`Unknown model: ${routerModelKey}`);
    const id = randomUUID();
    repository.saveConversation({
      id,
      workspaceId: command.workspaceId,
      kind: "group",
      title,
      participantIds: ["human", ...agentIds],
      routing: {
        mode: "auto",
        routerModelKey,
        fallbackAgentId,
        maxAgents: Math.min(5, Math.max(1, command.routing?.maxAgents ?? 3)),
      },
      createdAt: new Date().toISOString(),
    });
    await publishWorkspace(command.workspaceId);
    return { conversationId: id, created: true };
  }

  if (command.type === "conversation.group.rename") {
    const conversation = requireGroup(
      repository,
      command.workspaceId,
      command.conversationId,
    );
    const title = command.title.trim();
    if (!title) throw new Error("Group conversation title is required");
    repository.saveConversation({ ...conversation, title });
    await publishWorkspace(command.workspaceId);
    return {};
  }

  if (command.type === "conversation.create") {
    if (!repository.getWorkspace(command.workspaceId))
      throw new Error(`Workspace not found: ${command.workspaceId}`);
    if (!command.agentId) throw new Error("Conversation requires an Agent");
    const id = command.conversationId ?? randomUUID();
    if (repository.getConversation(command.workspaceId, id))
      throw new Error(`Conversation already exists: ${id}`);
    const agent = repository.getParticipant(
      command.workspaceId,
      command.agentId,
    );
    if (agent?.kind !== "agent" || agent.status !== "active")
      throw new Error(`Active Agent not found: ${command.agentId}`);
    repository.saveConversation({
      id,
      workspaceId: command.workspaceId,
      kind: "group",
      title: command.title,
      participantIds: ["human", command.agentId],
      createdAt: new Date().toISOString(),
    });
    await publishWorkspace(command.workspaceId);
    return { created: true };
  }

  const conversation = requireGroup(
    repository,
    command.workspaceId,
    command.conversationId,
  );
  if (command.type === "conversation.member.remove") {
    const activeRuns = (await listRuns()).runs.filter(
      (run) =>
        run.context?.workspaceId === command.workspaceId &&
        run.context.conversationId === command.conversationId &&
        run.context.agentId === command.agentId &&
        ["queued", "running", "retrying", "waiting", "blocked"].includes(
          run.status,
        ),
    );
    if (activeRuns.length > 0)
      throw new Error(
        "Agent has active or approval-waiting Runs in this conversation",
      );
  }
  const ids =
    command.type === "conversation.member.add"
      ? [...new Set([...conversation.participantIds, ...command.agentIds])]
      : conversation.participantIds.filter((id) => id !== command.agentId);
  const agents = ids
    .filter((id) => id !== "human")
    .map((id) => repository.getParticipant(command.workspaceId, id));
  if (
    agents.some((agent) => agent?.kind !== "agent" || agent.status !== "active")
  )
    throw new Error("Only active Agents can join a group");
  if (agents.length === 0) throw new Error("Group conversation needs an Agent");
  repository.saveConversation({
    ...conversation,
    participantIds: ["human", ...ids.filter((id) => id !== "human")],
  });
  await publishWorkspace(command.workspaceId);
  return {};
}

function requireGroup(
  repository: WorkspaceRepository,
  workspaceId: string,
  conversationId: string,
): Conversation {
  const conversation = repository.getConversation(workspaceId, conversationId);
  if (conversation?.kind !== "group")
    throw new Error("Group conversation not found");
  return conversation;
}
