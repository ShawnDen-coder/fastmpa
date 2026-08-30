import type { AgentRun, SqliteDatabase } from "@shawnden-coder/agent-runtime";
import {
  type Message,
  markConversationRead,
  type WorkspaceRepository,
} from "workspace";

export class CompletionProjector {
  public constructor(
    private readonly database: SqliteDatabase["client"],
    private readonly repository: WorkspaceRepository,
  ) {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS application_projection_receipts (
        run_id TEXT PRIMARY KEY NOT NULL,
        projected_at TEXT NOT NULL
      );
    `);
  }

  public project(run: AgentRun): void {
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
    this.database.transaction(() => {
      const receipt = this.database
        .prepare(
          "SELECT run_id AS runId FROM application_projection_receipts WHERE run_id = ?",
        )
        .get(run.runId) as { runId: string } | undefined;
      if (receipt) return;
      let sequence = this.repository
        .listMessages(context.workspaceId, conversation.id)
        .reduce((max, message) => Math.max(max, message.sequence), 0);
      for (const [index, message] of messages.entries()) {
        const id = `reply:${run.runId}:${index}`;
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
        this.database
          .prepare(
            "INSERT OR IGNORE INTO workspace_records (kind, workspace_id, record_id, payload_json) VALUES (?, ?, ?, ?)",
          )
          .run(
            "message",
            value.workspaceId,
            `${value.conversationId}:${id}`,
            JSON.stringify(value),
          );
      }
      this.database
        .prepare(
          "INSERT INTO workspace_cursors (workspace_id, agent_id, conversation_id, last_sequence) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, agent_id, conversation_id) DO UPDATE SET last_sequence = MAX(last_sequence, excluded.last_sequence)",
        )
        .run(context.workspaceId, agentId, conversation.id, source.sequence);
      this.database
        .prepare(
          "INSERT INTO application_projection_receipts (run_id, projected_at) VALUES (?, ?)",
        )
        .run(run.runId, now);
    })();
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
