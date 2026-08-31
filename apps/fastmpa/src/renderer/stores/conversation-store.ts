import { create } from "zustand";
import type {
  ConversationQuery,
  ConversationSnapshot,
} from "../../shared/contracts/snapshot.js";

export interface ConversationState {
  readonly snapshots: Readonly<Record<string, ConversationSnapshot>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly failedMessages: Readonly<Record<string, string>>;
  readonly sendQueues: Readonly<Record<string, readonly string[]>>;
  readonly setDraft: (conversationKey: string, draft: string) => void;
  readonly setFailedMessage: (conversationKey: string, body: string) => void;
  readonly clearFailedMessage: (conversationKey: string) => void;
  readonly enqueue: (conversationKey: string, body: string) => void;
  readonly dequeue: (conversationKey: string) => void;
  readonly setSnapshot: (
    query: ConversationQuery,
    snapshot: ConversationSnapshot,
  ) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  snapshots: {},
  drafts: {},
  failedMessages: {},
  sendQueues: {},
  setDraft: (conversationKey, draft) =>
    set((state) => ({ drafts: { ...state.drafts, [conversationKey]: draft } })),
  setFailedMessage: (conversationKey, body) =>
    set((state) => ({
      failedMessages: { ...state.failedMessages, [conversationKey]: body },
    })),
  clearFailedMessage: (conversationKey) =>
    set((state) => {
      const failedMessages = { ...state.failedMessages };
      delete failedMessages[conversationKey];
      return { failedMessages };
    }),
  enqueue: (conversationKey, body) =>
    set((state) => ({
      sendQueues: {
        ...state.sendQueues,
        [conversationKey]: [...(state.sendQueues[conversationKey] ?? []), body],
      },
    })),
  dequeue: (conversationKey) =>
    set((state) => ({
      sendQueues: {
        ...state.sendQueues,
        [conversationKey]: (state.sendQueues[conversationKey] ?? []).slice(1),
      },
    })),
  setSnapshot: (query, snapshot) =>
    set((state) => ({
      snapshots: {
        ...state.snapshots,
        [`${query.workspaceId}:${query.conversationId}`]: snapshot,
      },
    })),
}));
