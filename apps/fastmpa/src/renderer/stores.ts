import { create } from "zustand";
import type { ApplicationEvent, ApplicationLogEntry } from "../application.js";

interface ShellState {
  readonly page: string;
  readonly setPage: (page: string) => void;
}

interface SelectionState {
  readonly workspaceId?: string;
  readonly conversationId?: string;
  readonly agentId?: string;
  readonly runId?: string;
  readonly setWorkspaceId: (workspaceId?: string) => void;
  readonly setConversationId: (conversationId?: string) => void;
  readonly setAgentId: (agentId?: string) => void;
  readonly setRunId: (runId?: string) => void;
}

interface LogState {
  readonly entries: readonly ApplicationLogEntry[];
  readonly append: (entry: ApplicationLogEntry) => void;
  readonly mergeHistory: (entries: readonly ApplicationLogEntry[]) => void;
}

interface RuntimeState {
  readonly events: readonly ApplicationEvent[];
  readonly streamingByConversation: Readonly<Record<string, string>>;
  readonly appendEvent: (event: ApplicationEvent) => void;
  readonly appendTextDelta: (conversationKey: string, delta: string) => void;
  readonly clearStreaming: (conversationKey: string) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  page: "Conversations",
  setPage: (page) => set({ page }),
}));

export const useSelectionStore = create<SelectionState>((set) => ({
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setConversationId: (conversationId) => set({ conversationId }),
  setAgentId: (agentId) => set({ agentId }),
  setRunId: (runId) => set({ runId }),
}));

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  append: (entry) =>
    set((state) => ({ entries: [...state.entries.slice(-499), entry] })),
  mergeHistory: (entries) => {
    const merged = new Map(
      [...entries, ...get().entries].map((entry) => [entry.sequence, entry]),
    );
    set({
      entries: [...merged.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .slice(-500),
    });
  },
}));

export const useRuntimeStore = create<RuntimeState>((set) => ({
  events: [],
  streamingByConversation: {},
  appendEvent: (event) =>
    set((state) => ({ events: [...state.events.slice(-199), event] })),
  appendTextDelta: (conversationKey, delta) =>
    set((state) => ({
      streamingByConversation: {
        ...state.streamingByConversation,
        [conversationKey]:
          (state.streamingByConversation[conversationKey] ?? "") + delta,
      },
    })),
  clearStreaming: (conversationKey) =>
    set((state) => {
      const streamingByConversation = { ...state.streamingByConversation };
      delete streamingByConversation[conversationKey];
      return { streamingByConversation };
    }),
}));
