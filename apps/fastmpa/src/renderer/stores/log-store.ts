import { create } from "zustand";
import type { ApplicationLogEntry } from "../../shared/contracts/application.js";

export interface LogState {
  readonly entries: readonly ApplicationLogEntry[];
  readonly level: "all" | ApplicationLogEntry["level"];
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly component: string;
  readonly followLatest: boolean;
  readonly append: (entry: ApplicationLogEntry) => void;
  readonly mergeEntries: (entries: readonly ApplicationLogEntry[]) => void;
  readonly mergeHistory: (entries: readonly ApplicationLogEntry[]) => void;
  readonly setLevel: (level: "all" | ApplicationLogEntry["level"]) => void;
  readonly setWorkspaceId: (workspaceId: string) => void;
  readonly setConversationId: (conversationId: string) => void;
  readonly setRunId: (runId: string) => void;
  readonly setComponent: (component: string) => void;
  readonly setFollowLatest: (followLatest: boolean) => void;
}

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
  mergeEntries: (entries) =>
    set((state) => {
      const merged = new Map(
        [...state.entries, ...entries].map((entry) => [entry.sequence, entry]),
      );
      return {
        entries: [...merged.values()]
          .sort((left, right) => left.sequence - right.sequence)
          .slice(-500),
      };
    }),
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
