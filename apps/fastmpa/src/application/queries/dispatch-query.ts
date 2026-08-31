import type { ConversationDispatch, WorkspaceRepository } from "workspace";

export function getDispatchSnapshot(
  repository: WorkspaceRepository,
  dispatchId: string,
): ConversationDispatch {
  const dispatch = repository
    .listDispatches()
    .find((item) => item.id === dispatchId);
  if (!dispatch) throw new Error(`Dispatch not found: ${dispatchId}`);
  return dispatch;
}
