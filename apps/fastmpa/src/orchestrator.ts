import type { AgentRun } from "@shawnden-coder/agent-runtime";
import {
  type Message,
  markConversationRead,
  type WorkspaceRepository,
} from "workspace";

export class CompletionProjector {
  public constructor(private readonly repository: WorkspaceRepository) {}

  public project(run: AgentRun): void {
    // 只投影来自消息触发且成功完成的 Run；其它触发源没有 Conversation reply。
    if (
      run.status !== "completed" ||
      !run.context?.sourceRef ||
      run.context.sourceRef.type !== "message" ||
      !run.context.conversationId
    )
      return;
    const context = run.context;
    const conversationId = context.conversationId;
    if (!conversationId) return;
    const conversation = this.repository.getConversation(
      context.workspaceId,
      conversationId,
    );
    if (!conversation) return;
    const source = this.repository
      .listMessages(context.workspaceId, conversation.id)
      .find((message) => message.id === context.sourceRef?.id);
    if (!source) return;
    const messages = (run.result?.messages ?? []).filter(
      (message) => message.role === "assistant",
    );
    const agentId = context.agentId;
    const now = new Date().toISOString();
    let sequence = this.repository
      .listMessages(context.workspaceId, conversation.id)
      .reduce((max, message) => Math.max(max, message.sequence), 0);
    const existing = new Set(
      this.repository
        .listMessages(context.workspaceId, conversation.id)
        .map((message) => message.id),
    );
    // reply ID 与 runId/index 固定绑定，进程崩溃重启后可安全重复投影。
    for (const [index, message] of messages.entries()) {
      const id = `reply:${run.runId}:${index}`;
      if (existing.has(id)) continue;
      const value: Message = {
        id,
        workspaceId: context.workspaceId,
        conversationId: conversation.id,
        senderId: context.agentId,
        body: message.content,
        mentions: [],
        sequence: ++sequence,
        createdAt: now,
      };
      this.repository.saveMessage(value);
    }
    const cursor = this.repository.getReadCursor(
      context.workspaceId,
      agentId,
      conversation.id,
    );
    if (source.sequence > cursor.lastSequence)
      markConversationRead(
        this.repository,
        context.workspaceId,
        agentId,
        conversation.id,
        source.sequence,
      );
  }

  public projectAll(runs: readonly AgentRun[]): void {
    for (const run of runs) this.project(run);
  }
}

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
  const context = run.context;
  const conversationId = context.conversationId;
  const conversation = conversationId
    ? repository.getConversation(context.workspaceId, conversationId)
    : repository
        .listConversations(run.context.workspaceId)
        .find((item) => item.participantIds.includes(context.agentId));
  if (!conversation) return;
  const last = repository
    .listMessages(context.workspaceId, conversation.id)
    .filter((item) => item.id === context.sourceRef?.id)
    .at(-1);
  if (last)
    markConversationRead(
      repository,
      context.workspaceId,
      context.agentId,
      conversation.id,
      last.sequence,
    );
}
