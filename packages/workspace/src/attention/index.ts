import type { Card } from "../board/index.js";
import type { Message } from "../conversation/index.js";
import type { WorkspaceRepository } from "../repository/index.js";

export interface AttentionSnapshot {
  workspaceId: string;
  agentId: string;
  inbox: readonly Message[];
  agenda: readonly Card[];
}

export interface WorkspaceChange {
  workspaceId: string;
  kind: "message.created" | "card.assigned";
  sourceId: string;
  candidateAgentIds: readonly string[];
}

export function loadInbox(
  repository: WorkspaceRepository,
  workspaceId: string,
  agentId: string,
): readonly Message[] {
  return repository
    .listConversations(workspaceId)
    .flatMap((conversation) => {
      if (!conversation.participantIds.includes(agentId)) return [];
      const cursor = repository.getReadCursor(
        workspaceId,
        agentId,
        conversation.id,
      );
      return repository
        .listMessages(workspaceId, conversation.id)
        .filter((message) => message.sequence > cursor.lastSequence);
    })
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

export function loadAgenda(
  repository: WorkspaceRepository,
  workspaceId: string,
  agentId: string,
): readonly Card[] {
  return repository
    .listCards(workspaceId)
    .filter((card) => card.assigneeId === agentId);
}

export function loadAttention(
  repository: WorkspaceRepository,
  workspaceId: string,
  agentId: string,
): AttentionSnapshot {
  return {
    workspaceId,
    agentId,
    inbox: loadInbox(repository, workspaceId, agentId),
    agenda: loadAgenda(repository, workspaceId, agentId),
  };
}

export function markConversationRead(
  repository: WorkspaceRepository,
  workspaceId: string,
  agentId: string,
  conversationId: string,
  lastSequence: number,
): void {
  const current = repository.getReadCursor(
    workspaceId,
    agentId,
    conversationId,
  );
  if (lastSequence < current.lastSequence)
    throw new Error("Read cursor cannot move backwards");
  repository.saveReadCursor({
    workspaceId,
    agentId,
    conversationId,
    lastSequence,
  });
}
