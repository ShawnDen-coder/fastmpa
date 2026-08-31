import type { WorkbenchPage } from "../components/workbench/types.js";
import { useShellStore } from "../stores/index.js";

export function useNavigationController(): {
  readonly page: WorkbenchPage;
  readonly inspectorRunId: string | undefined;
  readonly conversationListWidth: number;
  readonly setPage: (page: WorkbenchPage) => void;
  readonly setInspectorRunId: (runId: string | undefined) => void;
  readonly resizeConversationList: (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
} {
  const page = useShellStore((state) => state.page);
  const setPage = useShellStore((state) => state.setPage);
  const inspectorRunId = useShellStore((state) => state.inspectorRunId);
  const setInspectorRunId = useShellStore((state) => state.setInspectorRunId);
  const conversationListWidth = useShellStore(
    (state) => state.conversationListWidth,
  );
  const setConversationListWidth = useShellStore(
    (state) => state.setConversationListWidth,
  );
  function resizeConversationList(
    event: React.PointerEvent<HTMLButtonElement>,
  ): void {
    const startX = event.clientX;
    const startWidth = conversationListWidth;
    const handleMove = (moveEvent: PointerEvent): void => {
      setConversationListWidth(startWidth + moveEvent.clientX - startX);
    };
    const handleUp = (): void => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }
  return {
    page,
    inspectorRunId,
    conversationListWidth,
    setPage,
    setInspectorRunId,
    resizeConversationList,
  };
}
