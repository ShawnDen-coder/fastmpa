import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Board, Card, Column } from "./board.js";
import {
  type Conversation,
  type Message,
  normalizeConversation,
  type ReadCursor,
} from "./conversation.js";
import type { ConversationDispatch } from "./dispatch.js";
import {
  type AgentInput,
  type AgentPatch,
  normalizeParticipantName,
  type Participant,
} from "./participant.js";
import type { WorkspaceRepository } from "./repository.js";
import type { Schedule } from "./schedule.js";
import type { Workspace } from "./workspace.js";

type RecordKind =
  | "workspace"
  | "participant"
  | "conversation"
  | "dispatch"
  | "message"
  | "board"
  | "column"
  | "card"
  | "schedule";

/** SQLite-backed Workspace facts. JSON keeps the repository compatible with the small domain types. */
export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly database: Database.Database;
  private readonly ownsDatabase: boolean;

  constructor(filePath: string);
  constructor(database: Database.Database, ownsDatabase: boolean);
  constructor(
    filePathOrDatabase: string | Database.Database,
    ownsDatabase = true,
  ) {
    if (typeof filePathOrDatabase === "string") {
      mkdirSync(dirname(filePathOrDatabase), { recursive: true });
      this.database = new Database(filePathOrDatabase);
      this.ownsDatabase = true;
    } else {
      this.database = filePathOrDatabase;
      this.ownsDatabase = ownsDatabase;
    }
    this.initialize();
  }

  public static fromDatabase(
    database: Database.Database,
  ): SqliteWorkspaceRepository {
    return new SqliteWorkspaceRepository(database, false);
  }

  private initialize(): void {
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
    this.ensureWorkspaceRecords();
  }

  private ensureWorkspaceRecords(): void {
    const rows = this.database
      .prepare(
        `SELECT DISTINCT workspace_id AS workspaceId FROM workspace_records WHERE kind <> 'workspace' UNION SELECT DISTINCT workspace_id AS workspaceId FROM workspace_cursors`,
      )
      .all() as { workspaceId: string }[];
    const now = new Date().toISOString();
    for (const row of rows) {
      if (this.getWorkspace(row.workspaceId)) continue;
      this.saveWorkspace({
        id: row.workspaceId,
        name:
          row.workspaceId === "default" ? "Default Workspace" : row.workspaceId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  close(): void {
    if (this.ownsDatabase) this.database.close();
  }

  saveWorkspace(value: Workspace): void {
    this.save("workspace", value.id, value.id, value);
  }
  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.get("workspace", workspaceId, workspaceId);
  }
  listWorkspaces(): readonly Workspace[] {
    return this.listAll<Workspace>("workspace").sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  }

  /** Application-owned shared connections are closed by the application. */
  get connection(): Database.Database {
    return this.database;
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
  findAgentByName(workspaceId: string, name: string): Participant | undefined {
    const normalized = normalizeParticipantName(name);
    return this.listParticipants(workspaceId).find(
      (participant) =>
        participant.kind === "agent" &&
        normalizeParticipantName(participant.name) === normalized,
    );
  }
  createAgent(workspaceId: string, input: AgentInput): Participant {
    if (this.findAgentByName(workspaceId, input.name))
      throw new Error(`Agent name already exists: ${input.name.trim()}`);
    const participant: Participant = {
      id: input.id ?? randomUUID(),
      workspaceId,
      kind: "agent",
      name: input.name.trim(),
      status: "active",
      agent: {
        modelKey: input.modelKey,
        persona: input.persona,
        role: input.role,
        capabilities: [...input.capabilities],
        toolNames: [...input.toolNames],
      },
    };
    this.saveParticipant(participant);
    return participant;
  }
  updateAgent(
    workspaceId: string,
    agentId: string,
    patch: AgentPatch,
  ): Participant {
    const current = requireAgent(this, workspaceId, agentId);
    if (
      patch.name &&
      normalizeParticipantName(patch.name) !==
        normalizeParticipantName(current.name) &&
      this.findAgentByName(workspaceId, patch.name)
    )
      throw new Error(`Agent name already exists: ${patch.name.trim()}`);
    const { name: _name, ...profilePatch } = patch;
    const updated = {
      ...current,
      ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
      agent: { ...current.agent, ...profilePatch },
    } as Participant;
    this.saveParticipant(updated);
    return updated;
  }
  setAgentStatus(
    workspaceId: string,
    agentId: string,
    status: "active" | "inactive",
  ): Participant {
    const current = requireAgent(this, workspaceId, agentId);
    const updated = { ...current, status };
    this.saveParticipant(updated);
    return updated;
  }

  saveConversation(value: Conversation): void {
    this.save("conversation", value.workspaceId, value.id, value);
  }
  getConversation(workspaceId: string, id: string): Conversation | undefined {
    const conversation = this.get<Conversation>(
      "conversation",
      workspaceId,
      id,
    );
    return conversation ? normalizeConversation(conversation) : undefined;
  }
  listConversations(workspaceId: string): readonly Conversation[] {
    return this.list<Conversation>("conversation", workspaceId).map(
      normalizeConversation,
    );
  }
  findDirectConversation(
    workspaceId: string,
    agentId: string,
  ): Conversation | undefined {
    return this.listConversations(workspaceId).find(
      (conversation) =>
        (conversation.kind ?? "group") === "direct" &&
        conversation.participantIds.length === 2 &&
        conversation.participantIds.includes(agentId) &&
        conversation.participantIds.includes("human"),
    );
  }
  saveDispatch(value: ConversationDispatch): void {
    this.save("dispatch", value.workspaceId, value.id, value);
  }
  getDispatch(
    workspaceId: string,
    id: string,
  ): ConversationDispatch | undefined {
    return this.get("dispatch", workspaceId, id);
  }
  listDispatches(workspaceId?: string): readonly ConversationDispatch[] {
    return this.listAll<ConversationDispatch>("dispatch", workspaceId).sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
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
  deleteSchedule(workspaceId: string, id: string): void {
    this.database
      .prepare(
        "DELETE FROM workspace_records WHERE kind = ? AND workspace_id = ? AND record_id = ?",
      )
      .run("schedule", workspaceId, id);
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

function requireAgent(
  repository: SqliteWorkspaceRepository,
  workspaceId: string,
  agentId: string,
): Participant {
  const participant = repository.getParticipant(workspaceId, agentId);
  if (participant?.kind !== "agent")
    throw new Error(`Agent not found: ${agentId}`);
  if (!participant.agent)
    throw new Error(`Agent profile is missing: ${agentId}`);
  return participant;
}
