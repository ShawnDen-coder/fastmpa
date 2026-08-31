import { useCallback, useEffect } from "react";
import type { SnapshotInvalidation } from "../../shared/contracts/invalidation.js";
import type { ShellSnapshot } from "../../shared/contracts/snapshot.js";
import {
  useConversationStore,
  useRuntimeStore,
  useSelectionStore,
  useShellStore,
} from "../stores/index.js";

export function useShellSubscriptions(
  selectedWorkspaceId: string | undefined,
): void {
  const setShellSnapshot = useShellStore((state) => state.setSnapshot);
  const setDesktopInfo = useShellStore((state) => state.setDesktopInfo);
  const setClosing = useShellStore((state) => state.setClosing);
  const setSelectedWorkspaceId = useSelectionStore(
    (state) => state.setWorkspaceId,
  );
  const setConversationSnapshot = useConversationStore(
    (state) => state.setSnapshot,
  );
  const setRunSnapshot = useRuntimeStore((state) => state.setSnapshot);
  const mergeEvents = useRuntimeStore((state) => state.mergeEvents);
  const mergePersistedEvents = useRuntimeStore(
    (state) => state.mergePersistedEvents,
  );

  const hydrateRunSnapshots = useCallback(
    async (snapshot: ShellSnapshot): Promise<void> => {
      const runIds = new Set(
        snapshot.dispatches.flatMap((dispatch) =>
          dispatch.assignments.map((assignment) => assignment.runId),
        ),
      );
      await Promise.all(
        [...runIds].map(async (runId) => {
          setRunSnapshot(
            await window.fastMpa.application.getRunSnapshot(runId),
            runId,
          );
        }),
      );
    },
    [setRunSnapshot],
  );

  const refreshInvalidatedSnapshot = useCallback(
    async (scope: SnapshotInvalidation): Promise<void> => {
      if (
        scope.scope === "shell" ||
        (scope.scope === "workspace" &&
          scope.workspaceId === selectedWorkspaceId) ||
        (scope.scope === "dispatch" &&
          (scope.workspaceId === undefined ||
            scope.workspaceId === selectedWorkspaceId))
      ) {
        const snapshot =
          selectedWorkspaceId === undefined
            ? await window.fastMpa.application.getShellSnapshot()
            : await window.fastMpa.application.getShellSnapshot({
                workspaceId: selectedWorkspaceId,
              });
        setShellSnapshot(snapshot);
        await hydrateRunSnapshots(snapshot);
        return;
      }
      if (scope.scope === "conversation") {
        const snapshot =
          await window.fastMpa.application.getConversationSnapshot({
            workspaceId: scope.workspaceId,
            conversationId: scope.conversationId,
          });
        setConversationSnapshot(
          {
            workspaceId: scope.workspaceId,
            conversationId: scope.conversationId,
          },
          snapshot,
        );
        mergePersistedEvents(
          `${scope.workspaceId}:${scope.conversationId}`,
          snapshot.events,
        );
        return;
      }
      if (scope.scope === "workspace" || scope.scope === "dispatch") return;
      setRunSnapshot(
        await window.fastMpa.application.getRunSnapshot(scope.runId),
        scope.runId,
      );
    },
    [
      hydrateRunSnapshots,
      mergePersistedEvents,
      selectedWorkspaceId,
      setConversationSnapshot,
      setRunSnapshot,
      setShellSnapshot,
    ],
  );

  useEffect(() => {
    let active = true;
    const initialSnapshot =
      selectedWorkspaceId === undefined
        ? window.fastMpa.application.getShellSnapshot()
        : window.fastMpa.application.getShellSnapshot({
            workspaceId: selectedWorkspaceId,
          });
    void initialSnapshot.then((snapshot) => {
      if (!active) return;
      setShellSnapshot(snapshot);
      setSelectedWorkspaceId(snapshot.workspaceId);
      void hydrateRunSnapshots(snapshot);
    });
    void window.fastMpa.desktop.getInfo().then(setDesktopInfo);
    const unsubscribeEvents = window.fastMpa.application.onEvents((events) => {
      if (active) mergeEvents(events);
    });
    const unsubscribeInvalidation =
      window.fastMpa.application.onSnapshotInvalidated((scope) => {
        void refreshInvalidatedSnapshot(scope);
      });
    const unsubscribeClosing = window.fastMpa.desktop.onClosing(() => {
      if (active) setClosing(true);
    });
    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeInvalidation();
      unsubscribeClosing();
    };
  }, [
    hydrateRunSnapshots,
    mergeEvents,
    refreshInvalidatedSnapshot,
    selectedWorkspaceId,
    setClosing,
    setDesktopInfo,
    setShellSnapshot,
    setSelectedWorkspaceId,
  ]);
}
