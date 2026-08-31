import type { Message, Participant, WorkspaceRepository } from "workspace";

export type AgentContextMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

/** Build a model context without confusing collaborator replies with the target Agent's own voice. */
export function buildAgentContextMessages(
  messages: readonly Message[],
  agentId: string,
  repository: WorkspaceRepository,
  workspaceId: string,
): readonly AgentContextMessage[] {
  return messages.map((message) => {
    if (message.senderId === "human")
      return { role: "user", content: message.body };
    if (message.senderId === agentId)
      return { role: "assistant", content: message.body };
    const name =
      repository.getParticipant(workspaceId, message.senderId)?.name ??
      message.senderId;
    return { role: "user", content: `[${name}] ${message.body}` };
  });
}

export function selectConversationContext(
  messages: readonly AgentContextMessage[],
  limit: number,
): readonly AgentContextMessage[] {
  if (messages.length <= limit) return messages;
  const selected = messages.slice(-limit);
  while (selected[0]?.role === "assistant") selected.shift();
  return selected;
}

export function findMentionedAgentIds(
  body: string,
  agents: readonly Participant[],
): readonly string[] {
  const normalizedBody = body.toLocaleLowerCase();
  return agents
    .filter((agent) =>
      normalizedBody.includes(`@${agent.name.trim().toLocaleLowerCase()}`),
    )
    .map((agent) => agent.id);
}
