import { create } from "zustand";

export interface ConversationState {
  readonly drafts: Readonly<Record<string, string>>;
  readonly failedMessages: Readonly<Record<string, string>>;
  readonly sendQueues: Readonly<Record<string, readonly string[]>>;
  readonly setDraft: (conversationKey: string, draft: string) => void;
  readonly setFailedMessage: (conversationKey: string, body: string) => void;
  readonly clearFailedMessage: (conversationKey: string) => void;
  readonly enqueue: (conversationKey: string, body: string) => void;
  readonly dequeue: (conversationKey: string) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
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
}));
