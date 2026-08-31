import { create } from "zustand";
import type { ShellSnapshot } from "../../shared/contracts/snapshot.js";
import type { DesktopInfo } from "../../shared/desktop-api.js";
import type { WorkbenchPage } from "../components/workbench/types.js";

export interface ShellState {
  readonly snapshot?: ShellSnapshot;
  readonly desktopInfo?: DesktopInfo;
  readonly closing: boolean;
  readonly page: WorkbenchPage;
  readonly inspectorRunId?: string;
  readonly conversationListWidth: number;
  readonly setPage: (page: WorkbenchPage) => void;
  readonly setInspectorRunId: (runId?: string) => void;
  readonly setConversationListWidth: (width: number) => void;
  readonly setSnapshot: (snapshot: ShellSnapshot) => void;
  readonly setDesktopInfo: (desktopInfo: DesktopInfo) => void;
  readonly setClosing: (closing: boolean) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  closing: false,
  page: "Conversations",
  inspectorRunId: undefined,
  conversationListWidth: 320,
  setPage: (page) => set({ page }),
  setInspectorRunId: (inspectorRunId) => set({ inspectorRunId }),
  setConversationListWidth: (width) =>
    set({ conversationListWidth: Math.min(520, Math.max(240, width)) }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setDesktopInfo: (desktopInfo) => set({ desktopInfo }),
  setClosing: (closing) => set({ closing }),
}));
