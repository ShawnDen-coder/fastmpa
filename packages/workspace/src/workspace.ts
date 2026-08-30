import type { WorkspaceChange } from "./attention.js";
import type { Card } from "./board.js";
import type { Conversation, Message } from "./conversation.js";
import type { WorkspaceRepository } from "./repository.js";

export interface SendMessageInput {
  id: string;
  workspaceId: string;
  conversationId: string;
  senderId: string;
  body: string;
  mentions?: readonly string[];
  createdAt: string;
}

export function sendMessage(
  repository: WorkspaceRepository,
  input: SendMessageInput,
): { message: Message; change: WorkspaceChange } {
  const conversation = requireConversation(
    repository,
    input.workspaceId,
    input.conversationId,
  );
  requireParticipant(repository, input.workspaceId, input.senderId);
  if (!conversation.participantIds.includes(input.senderId))
    throw new Error(
      `Sender ${input.senderId} is not in conversation ${conversation.id}`,
    );
  const mentions = input.mentions ?? [];
  for (const participantId of mentions) {
    requireParticipant(repository, input.workspaceId, participantId);
    if (!conversation.participantIds.includes(participantId))
      throw new Error(
        `Mention ${participantId} is not in conversation ${conversation.id}`,
      );
  }
  const previous = repository.listMessages(input.workspaceId, conversation.id);
  const message: Message = {
    ...input,
    mentions,
    sequence: (previous.at(-1)?.sequence ?? 0) + 1,
  };
  repository.saveMessage(message);
  return {
    message,
    change: {
      workspaceId: input.workspaceId,
      kind: "message.created",
      sourceId: message.id,
      candidateAgentIds: mentions,
    },
  };
}

export function assignCard(
  repository: WorkspaceRepository,
  card: Card,
  assigneeId: string,
): WorkspaceChange {
  requireParticipant(repository, card.workspaceId, assigneeId);
  repository.saveCard({
    ...card,
    assigneeId,
    updatedAt: new Date().toISOString(),
  });
  return {
    workspaceId: card.workspaceId,
    kind: "card.assigned",
    sourceId: card.id,
    candidateAgentIds: [assigneeId],
  };
}

function requireParticipant(
  repository: WorkspaceRepository,
  workspaceId: string,
  participantId: string,
): void {
  if (!repository.getParticipant(workspaceId, participantId))
    throw new Error(
      `Participant ${participantId} is not in workspace ${workspaceId}`,
    );
}

function requireConversation(
  repository: WorkspaceRepository,
  workspaceId: string,
  conversationId: string,
): Conversation {
  const conversation = repository.getConversation(workspaceId, conversationId);
  if (!conversation)
    throw new Error(
      `Conversation ${conversationId} is not in workspace ${workspaceId}`,
    );
  return conversation;
}
