export interface Conversation {
  id: string;
  workspaceId: string;
  title?: string;
  participantIds: readonly string[];
  createdAt: string;
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
}

export interface ReadCursor {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  lastSequence: number;
}
