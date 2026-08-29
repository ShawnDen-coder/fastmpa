import type { WorkspaceReferencePort } from "apm";
import type { WorkspaceRepository } from "workspace";

/** 将 Cumora 风格 Workspace 事实投影给 APM，不让 APM 依赖 Workspace 实现。 */
export function createWorkspaceReferencePort(
  repository: WorkspaceRepository,
): WorkspaceReferencePort {
  return {
    hasCard: (workspaceId, cardId) =>
      repository.getCard(workspaceId, cardId) !== undefined,
    hasConversation: (workspaceId, conversationId) =>
      repository.getConversation(workspaceId, conversationId) !== undefined,
  };
}
