import { create } from "zustand";

export interface ShellState {
  readonly page: string;
  readonly inspectorRunId?: string;
  readonly conversationListWidth: number;
  readonly setPage: (page: string) => void;
  readonly setInspectorRunId: (runId?: string) => void;
  readonly setConversationListWidth: (width: number) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  page: "Conversations",
  inspectorRunId: undefined,
  conversationListWidth: 320,
  setPage: (page) => set({ page }),
  setInspectorRunId: (inspectorRunId) => set({ inspectorRunId }),
  setConversationListWidth: (width) =>
    set({ conversationListWidth: Math.min(520, Math.max(240, width)) }),
}));
