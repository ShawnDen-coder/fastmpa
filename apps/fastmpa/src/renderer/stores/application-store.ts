import { create } from "zustand";
import type { ApplicationSnapshot } from "../../shared/contracts/application.js";
import type {
  ConversationQuery,
  ConversationSnapshot,
  RunSnapshot,
  ShellSnapshot,
} from "../../shared/contracts/snapshot.js";
import type { DesktopInfo } from "../../shared/desktop-api.js";

export interface ApplicationState {
  readonly snapshot?: ApplicationSnapshot;
  readonly desktopInfo?: DesktopInfo;
  readonly closing: boolean;
  readonly setSnapshot: (snapshot: ApplicationSnapshot) => void;
  readonly mergeShellSnapshot: (snapshot: ShellSnapshot) => void;
  readonly mergeConversationSnapshot: (
    query: ConversationQuery,
    snapshot: ConversationSnapshot,
  ) => void;
  readonly mergeRunSnapshot: (snapshot: RunSnapshot) => void;
  readonly mergeDispatchSnapshot: (
    dispatch: ConversationSnapshot["dispatches"][number],
  ) => void;
  readonly setDesktopInfo: (desktopInfo: DesktopInfo) => void;
  readonly setClosing: (closing: boolean) => void;
}

export const useApplicationStore = create<ApplicationState>((set) => ({
  closing: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  mergeShellSnapshot: (next) =>
    set((state) => {
      if (!state.snapshot) return {};
      return {
        snapshot: {
          ...state.snapshot,
          workspaces: next.workspaces,
          selectedWorkspaceId:
            state.snapshot.selectedWorkspaceId &&
            next.workspaces.some(
              (workspace) =>
                workspace.id === state.snapshot?.selectedWorkspaceId,
            )
              ? state.snapshot.selectedWorkspaceId
              : next.selectedWorkspaceId,
          conversations: next.conversations,
          participants: next.participants,
          attention: next.attention,
          schedules: next.schedules,
          dispatches: next.dispatches,
        },
      };
    }),
  mergeConversationSnapshot: (query, next) =>
    set((state) => {
      if (!state.snapshot) return {};
      return {
        snapshot: {
          ...state.snapshot,
          messages: [
            ...state.snapshot.messages.filter(
              (message) => message.conversationId !== query.conversationId,
            ),
            ...next.messages,
          ],
          runs: [
            ...state.snapshot.runs.filter(
              (run) => run.context?.conversationId !== query.conversationId,
            ),
            ...next.runs,
          ],
          dispatches: [
            ...state.snapshot.dispatches.filter(
              (dispatch) => dispatch.conversationId !== query.conversationId,
            ),
            ...next.dispatches,
          ],
        },
      };
    }),
  mergeRunSnapshot: (next) =>
    set((state) => {
      if (!state.snapshot || !next.run) return {};
      return {
        snapshot: {
          ...state.snapshot,
          runs: [
            ...state.snapshot.runs.filter(
              (run) => run.runId !== next.run?.runId,
            ),
            next.run,
          ],
          dispatches: next.dispatch
            ? [
                ...state.snapshot.dispatches.filter(
                  (dispatch) => dispatch.id !== next.dispatch?.id,
                ),
                next.dispatch,
              ]
            : state.snapshot.dispatches,
        },
      };
    }),
  mergeDispatchSnapshot: (dispatch) =>
    set((state) => {
      if (!state.snapshot) return {};
      return {
        snapshot: {
          ...state.snapshot,
          dispatches: [
            ...state.snapshot.dispatches.filter(
              (item) => item.id !== dispatch.id,
            ),
            dispatch,
          ],
        },
      };
    }),
  setDesktopInfo: (desktopInfo) => set({ desktopInfo }),
  setClosing: (closing) => set({ closing }),
}));
