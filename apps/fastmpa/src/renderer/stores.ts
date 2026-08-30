import { create } from "zustand";
import type {
  ApplicationEvent,
  ApplicationLogEntry,
  ApplicationSnapshot,
} from "../application.js";
import type { DesktopInfo } from "../shared/desktop-api.js";

interface ShellState {
  readonly page: string;
  readonly inspectorRunId?: string;
  readonly setPage: (page: string) => void;
  readonly setInspectorRunId: (runId?: string) => void;
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
  readonly level: "all" | ApplicationLogEntry["level"];
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly component: string;
  readonly followLatest: boolean;
  readonly append: (entry: ApplicationLogEntry) => void;
  readonly mergeHistory: (entries: readonly ApplicationLogEntry[]) => void;
  readonly setLevel: (level: "all" | ApplicationLogEntry["level"]) => void;
  readonly setWorkspaceId: (workspaceId: string) => void;
  readonly setConversationId: (conversationId: string) => void;
  readonly setRunId: (runId: string) => void;
  readonly setComponent: (component: string) => void;
  readonly setFollowLatest: (followLatest: boolean) => void;
}

interface RuntimeState {
  readonly events: readonly ApplicationEvent[];
  readonly streamingByConversation: Readonly<Record<string, string>>;
  readonly appendEvent: (event: ApplicationEvent) => void;
  readonly appendTextDelta: (conversationKey: string, delta: string) => void;
  readonly clearStreaming: (conversationKey: string) => void;
}

interface ApplicationState {
  readonly snapshot?: ApplicationSnapshot;
  readonly desktopInfo?: DesktopInfo;
  readonly closing: boolean;
  readonly setSnapshot: (snapshot: ApplicationSnapshot) => void;
  readonly setDesktopInfo: (desktopInfo: DesktopInfo) => void;
  readonly setClosing: (closing: boolean) => void;
}

interface ConversationState {
  readonly drafts: Readonly<Record<string, string>>;
  readonly failedMessages: Readonly<Record<string, string>>;
  readonly sendQueues: Readonly<Record<string, readonly string[]>>;
  readonly setDraft: (conversationKey: string, draft: string) => void;
  readonly setFailedMessage: (conversationKey: string, body: string) => void;
  readonly clearFailedMessage: (conversationKey: string) => void;
  readonly enqueue: (conversationKey: string, body: string) => void;
  readonly dequeue: (conversationKey: string) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  page: "Conversations",
  inspectorRunId: undefined,
  setPage: (page) => set({ page }),
  setInspectorRunId: (inspectorRunId) => set({ inspectorRunId }),
}));

export const useSelectionStore = create<SelectionState>((set) => ({
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setConversationId: (conversationId) => set({ conversationId }),
  setAgentId: (agentId) => set({ agentId }),
  setRunId: (runId) => set({ runId }),
}));

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  level: "all",
  workspaceId: "all",
  conversationId: "all",
  runId: "all",
  component: "all",
  followLatest: true,
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
  setLevel: (level) => set({ level }),
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setConversationId: (conversationId) => set({ conversationId }),
  setRunId: (runId) => set({ runId }),
  setComponent: (component) => set({ component }),
  setFollowLatest: (followLatest) => set({ followLatest }),
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

export const useApplicationStore = create<ApplicationState>((set) => ({
  closing: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setDesktopInfo: (desktopInfo) => set({ desktopInfo }),
  setClosing: (closing) => set({ closing }),
}));

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
