import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Board, Card, Column } from "./board.js";
import type { Conversation, Message, ReadCursor } from "./conversation.js";
import type { Participant } from "./participant.js";
import type { WorkspaceRepository } from "./repository.js";
import type { Schedule } from "./schedule.js";

type RecordKind =
  | "participant"
  | "conversation"
  | "message"
  | "board"
  | "column"
  | "card"
  | "schedule";

/** SQLite-backed Workspace facts. JSON keeps the repository compatible with the small domain types. */
export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly database: Database.Database;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.database = new Database(filePath);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS workspace_records (
        kind TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (kind, workspace_id, record_id)
      );
      CREATE TABLE IF NOT EXISTS workspace_cursors (
        workspace_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        last_sequence INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, agent_id, conversation_id)
      );
    `);
  }

  close(): void {
    this.database.close();
  }

  saveParticipant(value: Participant): void {
    this.save("participant", value.workspaceId, value.id, value);
  }
  getParticipant(workspaceId: string, id: string): Participant | undefined {
    return this.get("participant", workspaceId, id);
  }
  listParticipants(workspaceId: string): readonly Participant[] {
    return this.list("participant", workspaceId);
  }

  saveConversation(value: Conversation): void {
    this.save("conversation", value.workspaceId, value.id, value);
  }
  getConversation(workspaceId: string, id: string): Conversation | undefined {
    return this.get("conversation", workspaceId, id);
  }
  listConversations(workspaceId: string): readonly Conversation[] {
    return this.list("conversation", workspaceId);
  }

  saveMessage(value: Message): void {
    this.save(
      "message",
      value.workspaceId,
      `${value.conversationId}:${value.id}`,
      value,
    );
  }
  listMessages(
    workspaceId: string,
    conversationId: string,
  ): readonly Message[] {
    return this.list<Message>("message", workspaceId)
      .filter((item) => item.conversationId === conversationId)
      .sort(
        (left, right) =>
          left.sequence - right.sequence || left.id.localeCompare(right.id),
      );
  }

  saveBoard(value: Board): void {
    this.save("board", value.workspaceId, value.id, value);
  }
  saveColumn(value: Column): void {
    this.save("column", value.workspaceId, value.id, value);
  }
  saveCard(value: Card): void {
    this.save("card", value.workspaceId, value.id, value);
  }
  getCard(workspaceId: string, id: string): Card | undefined {
    return this.get("card", workspaceId, id);
  }
  listCards(workspaceId: string, boardId?: string): readonly Card[] {
    return this.list<Card>("card", workspaceId)
      .filter((item) => !boardId || item.boardId === boardId)
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      );
  }

  getReadCursor(
    workspaceId: string,
    agentId: string,
    conversationId: string,
  ): ReadCursor {
    const row = this.database
      .prepare(
        `SELECT last_sequence AS lastSequence FROM workspace_cursors WHERE workspace_id = ? AND agent_id = ? AND conversation_id = ?`,
      )
      .get(workspaceId, agentId, conversationId) as
      | { lastSequence: number }
      | undefined;
    return {
      workspaceId,
      agentId,
      conversationId,
      lastSequence: row?.lastSequence ?? 0,
    };
  }
  saveReadCursor(value: ReadCursor): void {
    this.database
      .prepare(
        `INSERT INTO workspace_cursors (workspace_id, agent_id, conversation_id, last_sequence) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, agent_id, conversation_id) DO UPDATE SET last_sequence = excluded.last_sequence`,
      )
      .run(
        value.workspaceId,
        value.agentId,
        value.conversationId,
        value.lastSequence,
      );
  }

  saveSchedule(value: Schedule): void {
    this.save("schedule", value.workspaceId, value.id, value);
  }
  getSchedule(workspaceId: string, id: string): Schedule | undefined {
    return this.get("schedule", workspaceId, id);
  }
  listSchedules(workspaceId?: string): readonly Schedule[] {
    return this.listAll<Schedule>("schedule", workspaceId).sort(
      (left, right) =>
        left.nextRunAt - right.nextRunAt || left.id.localeCompare(right.id),
    );
  }

  listWorkspaceIds(): readonly string[] {
    const rows = this.database
      .prepare(
        `SELECT workspace_id AS workspaceId FROM workspace_records UNION SELECT workspace_id AS workspaceId FROM workspace_cursors ORDER BY workspace_id`,
      )
      .all() as { workspaceId: string }[];
    return rows.map((row) => row.workspaceId);
  }

  private save(
    kind: RecordKind,
    workspaceId: string,
    recordId: string,
    value: unknown,
  ): void {
    this.database
      .prepare(
        `INSERT INTO workspace_records (kind, workspace_id, record_id, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(kind, workspace_id, record_id) DO UPDATE SET payload_json = excluded.payload_json`,
      )
      .run(kind, workspaceId, recordId, JSON.stringify(value));
  }
  private get<T>(
    kind: RecordKind,
    workspaceId: string,
    recordId: string,
  ): T | undefined {
    const row = this.database
      .prepare(
        `SELECT payload_json AS payloadJson FROM workspace_records WHERE kind = ? AND workspace_id = ? AND record_id = ?`,
      )
      .get(kind, workspaceId, recordId) as { payloadJson: string } | undefined;
    return row ? (JSON.parse(row.payloadJson) as T) : undefined;
  }
  private list<T>(kind: RecordKind, workspaceId: string): T[] {
    return this.listAll(kind, workspaceId);
  }
  private listAll<T>(kind: RecordKind, workspaceId?: string): T[] {
    const rows = workspaceId
      ? this.database
          .prepare(
            `SELECT payload_json AS payloadJson FROM workspace_records WHERE kind = ? AND workspace_id = ?`,
          )
          .all(kind, workspaceId)
      : this.database
          .prepare(
            `SELECT payload_json AS payloadJson FROM workspace_records WHERE kind = ?`,
          )
          .all(kind);
    return (rows as { payloadJson: string }[]).map(
      (row) => JSON.parse(row.payloadJson) as T,
    );
  }
}
