import { create } from "zustand";

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
