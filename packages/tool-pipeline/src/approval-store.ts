import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolCall, ToolResult } from "@shawnden-coder/agent-core";
import Database from "better-sqlite3";
import type { ToolJournalEntry } from "./pipeline.js";

export interface ApprovalRequest {
  approvalId: string;
  toolCall: ToolCall;
  actorId: string;
  idempotencyKey: string;
}

export interface ApprovalStore {
  save(approval: ApprovalRequest): void;
  get(approvalId: string): ApprovalRequest | undefined;
  remove(approvalId: string): void;
  getResult?(idempotencyKey: string): ToolResult | undefined;
  saveResult?(idempotencyKey: string, result: ToolResult): void;
  appendJournal?(entry: ToolJournalEntry): void;
  listJournal?(): readonly ToolJournalEntry[];
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, ApprovalRequest>();

  save(approval: ApprovalRequest): void {
    this.approvals.set(approval.approvalId, approval);
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.approvals.get(approvalId);
  }

  remove(approvalId: string): void {
    this.approvals.delete(approvalId);
  }
}

export class SqliteApprovalStore implements ApprovalStore {
  private readonly database: Database.Database;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.database = new Database(filePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS tool_approvals (
        approval_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tool_results (
        idempotency_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tool_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload_json TEXT NOT NULL
      );
    `);
  }

  save(approval: ApprovalRequest): void {
    this.database
      .prepare(
        `INSERT INTO tool_approvals (approval_id, payload_json) VALUES (?, ?)
         ON CONFLICT(approval_id) DO UPDATE SET payload_json = excluded.payload_json`,
      )
      .run(approval.approvalId, JSON.stringify(approval));
  }

  get(approvalId: string): ApprovalRequest | undefined {
    const row = this.database
      .prepare(
        "SELECT payload_json AS payloadJson FROM tool_approvals WHERE approval_id = ?",
      )
      .get(approvalId) as { payloadJson: string } | undefined;
    return row ? (JSON.parse(row.payloadJson) as ApprovalRequest) : undefined;
  }

  remove(approvalId: string): void {
    this.database
      .prepare("DELETE FROM tool_approvals WHERE approval_id = ?")
      .run(approvalId);
  }

  getResult(idempotencyKey: string): ToolResult | undefined {
    const row = this.database
      .prepare(
        "SELECT payload_json AS payloadJson FROM tool_results WHERE idempotency_key = ?",
      )
      .get(idempotencyKey) as { payloadJson: string } | undefined;
    return row ? (JSON.parse(row.payloadJson) as ToolResult) : undefined;
  }

  saveResult(idempotencyKey: string, result: ToolResult): void {
    this.database
      .prepare(
        `INSERT INTO tool_results (idempotency_key, payload_json) VALUES (?, ?)
         ON CONFLICT(idempotency_key) DO UPDATE SET payload_json = excluded.payload_json`,
      )
      .run(idempotencyKey, JSON.stringify(result));
  }

  appendJournal(entry: ToolJournalEntry): void {
    this.database
      .prepare("INSERT INTO tool_journal (payload_json) VALUES (?)")
      .run(JSON.stringify(entry));
  }

  listJournal(): readonly ToolJournalEntry[] {
    const rows = this.database
      .prepare(
        "SELECT payload_json AS payloadJson FROM tool_journal ORDER BY id",
      )
      .all() as { payloadJson: string }[];
    return rows.map((row) => JSON.parse(row.payloadJson) as ToolJournalEntry);
  }

  close(): void {
    this.database.close();
  }
}
