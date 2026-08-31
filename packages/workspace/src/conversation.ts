export type ConversationKind = "direct" | "group";

export interface GroupRoutingPolicy {
  mode: "auto";
  routerModelKey: string;
  fallbackAgentId: string;
  maxAgents: number;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  /** Legacy records may omit this and are treated as group conversations. */
  kind?: ConversationKind;
  title?: string;
  participantIds: readonly string[];
  routing?: GroupRoutingPolicy;
  createdAt: string;
}

/** Classify legacy records that predate the explicit conversation kind field. */
export function normalizeConversation(
  conversation: Conversation,
): Conversation {
  if (conversation.kind) return conversation;
  const isDirect =
    conversation.participantIds.length === 2 &&
    conversation.participantIds.includes("human") &&
    conversation.participantIds.some((id) => id !== "human");
  return { ...conversation, kind: isDirect ? "direct" : "group" };
}

export interface Message {
  id: string;
  workspaceId: string;
  conversationId: string;
  senderId: string;
  body: string;
  mentions: readonly string[];
  sequence: number;
  createdAt: string;
  runId?: string;
}

export interface ReadCursor {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  lastSequence: number;
}
