import type { AgentRun } from "@shawnden-coder/agent-runtime";
import { markConversationRead, type WorkspaceRepository } from "workspace";

/** Run 完成后的持久化投影；可在启动时对终态 Run 重放，保证重启不丢 ReadCursor。 */
export function projectCompletedRun(
  repository: WorkspaceRepository,
  run: AgentRun,
): void {
  if (
    run.status !== "completed" ||
    !run.context?.sourceRef ||
    run.context.sourceRef.type !== "message"
  )
    return;
  const conversation = run.context.conversationId
    ? repository.getConversation(
        run.context.workspaceId,
        run.context.conversationId,
      )
    : repository
        .listConversations(run.context.workspaceId)
        .find((item) =>
          item.participantIds.includes(run.context?.agentId ?? ""),
        );
  if (!conversation) return;
  const last = repository
    .listMessages(run.context.workspaceId, conversation.id)
    .filter((item) => item.id === run.context?.sourceRef?.id)
    .at(-1);
  if (last)
    markConversationRead(
      repository,
      run.context.workspaceId,
      run.context.agentId,
      conversation.id,
      last.sequence,
    );
}
