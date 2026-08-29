import type { Requirement } from "apm";
import type { WorkspaceRepository } from "workspace";
import { sendMessage } from "workspace";

export interface RequirementReporterOptions {
  readonly repository: WorkspaceRepository;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly createId: () => string;
  readonly now: () => string;
}

/** App 层的副作用适配：把领域状态变化发布为 Workspace Conversation 消息。 */
export function createRequirementConversationReporter(
  options: RequirementReporterOptions,
): (requirement: Requirement, action: string) => void {
  return (requirement, action) => {
    sendMessage(options.repository, {
      id: options.createId(),
      workspaceId: options.workspaceId,
      conversationId: options.conversationId,
      senderId: options.senderId,
      body: `Requirement ${requirement.id} 已执行 ${action}，当前状态：${requirement.status}，版本：${requirement.version}。`,
      createdAt: options.now(),
    });
  };
}
