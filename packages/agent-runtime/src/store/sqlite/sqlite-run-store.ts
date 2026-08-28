import type { DatabaseSync } from "node:sqlite";
import { canTransition } from "../../lifecycle";
import type { AgentRun, RuntimeEvent } from "../../types";
import {
  DuplicateRunError,
  EventSequenceError,
  RunNotFoundError,
  RunVersionConflictError,
} from "../errors";
import type { RunStore } from "../run-store";
import type { SqliteStoreConfig } from "./config";
import { openSqliteDatabase } from "./database";

type RunRow = {
  run_id: string;
  status: AgentRun["status"];
  attempt: number;
  version: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
type EventRow = {
  run_id: string;
  sequence: number;
  type: string;
  occurred_at: string;
  data_json: string | null;
};

/** SQLite 版 RunStore；当前使用原生 SQL，Schema 使用 Drizzle 定义。 */
export class SqliteRunStore implements RunStore {
  private constructor(private readonly database: DatabaseSync) {}
  public static async open(config: SqliteStoreConfig): Promise<SqliteRunStore> {
    return new SqliteRunStore(await openSqliteDatabase(config));
  }

  public async create(run: AgentRun): Promise<void> {
    try {
      this.database
        .prepare("INSERT INTO agent_runs VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(
          run.runId,
          run.status,
          run.attempt,
          run.version,
          run.createdAt,
          run.startedAt ?? null,
          run.finishedAt ?? null,
        );
    } catch (error) {
      if (isConstraintError(error)) throw new DuplicateRunError(run.runId);
      throw error;
    }
  }

  public async get(runId: string): Promise<AgentRun | undefined> {
    const row = this.database
      .prepare("SELECT * FROM agent_runs WHERE run_id = ?")
      .get(runId) as RunRow | undefined;
    return row ? toRun(row) : undefined;
  }

  public async transition(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
  ): Promise<AgentRun> {
    const current = await this.get(runId);
    if (!current) throw new RunNotFoundError(runId);
    if (current.version !== expectedVersion)
      throw new RunVersionConflictError(
        runId,
        expectedVersion,
        current.version,
      );
    if (next.runId !== runId)
      throw new Error(`AgentRun id mismatch: ${runId} -> ${next.runId}`);
    if (!canTransition(current.status, next.status))
      throw new Error(
        `Invalid AgentRun transition: ${current.status} -> ${next.status}`,
      );
    if (next.version !== current.version + 1)
      throw new RunVersionConflictError(
        runId,
        current.version + 1,
        next.version,
      );
    const result = this.database
      .prepare(
        "UPDATE agent_runs SET status = ?, attempt = ?, version = ?, created_at = ?, started_at = ?, finished_at = ? WHERE run_id = ? AND version = ?",
      )
      .run(
        next.status,
        next.attempt,
        next.version,
        next.createdAt,
        next.startedAt ?? null,
        next.finishedAt ?? null,
        runId,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new RunVersionConflictError(
        runId,
        expectedVersion,
        current.version,
      );
    return next;
  }

  public async transitionWithEvent(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
    event: RuntimeEvent,
  ): Promise<AgentRun> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = await this.get(runId);
      if (!current) throw new RunNotFoundError(runId);
      if (current.version !== expectedVersion)
        throw new RunVersionConflictError(
          runId,
          expectedVersion,
          current.version,
        );
      if (next.runId !== runId)
        throw new Error(`AgentRun id mismatch: ${runId} -> ${next.runId}`);
      if (!canTransition(current.status, next.status))
        throw new Error(
          `Invalid AgentRun transition: ${current.status} -> ${next.status}`,
        );
      if (next.version !== current.version + 1)
        throw new RunVersionConflictError(
          runId,
          current.version + 1,
          next.version,
        );
      if (event.runId !== runId)
        throw new Error(`RuntimeEvent id mismatch: ${runId} -> ${event.runId}`);
      const last = this.database
        .prepare(
          "SELECT sequence FROM runtime_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(runId) as { sequence: number } | undefined;
      const lastSequence = last?.sequence ?? -1;
      if (event.sequence <= lastSequence)
        throw new EventSequenceError(runId, event.sequence, lastSequence);
      const updated = this.database
        .prepare(
          "UPDATE agent_runs SET status = ?, attempt = ?, version = ?, created_at = ?, started_at = ?, finished_at = ? WHERE run_id = ? AND version = ?",
        )
        .run(
          next.status,
          next.attempt,
          next.version,
          next.createdAt,
          next.startedAt ?? null,
          next.finishedAt ?? null,
          runId,
          expectedVersion,
        );
      if (updated.changes !== 1)
        throw new RunVersionConflictError(
          runId,
          expectedVersion,
          current.version,
        );
      this.database
        .prepare("INSERT INTO runtime_events VALUES (?, ?, ?, ?, ?)")
        .run(
          event.runId,
          event.sequence,
          event.type,
          event.occurredAt,
          event.data === undefined ? null : JSON.stringify(event.data),
        );
      this.database.exec("COMMIT");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  public async appendEvent(event: RuntimeEvent): Promise<void> {
    if (!(await this.get(event.runId))) throw new RunNotFoundError(event.runId);
    const last = this.database
      .prepare(
        "SELECT sequence FROM runtime_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1",
      )
      .get(event.runId) as { sequence: number } | undefined;
    const lastSequence = last?.sequence ?? -1;
    if (event.sequence <= lastSequence)
      throw new EventSequenceError(event.runId, event.sequence, lastSequence);
    try {
      this.database
        .prepare("INSERT INTO runtime_events VALUES (?, ?, ?, ?, ?)")
        .run(
          event.runId,
          event.sequence,
          event.type,
          event.occurredAt,
          event.data === undefined ? null : JSON.stringify(event.data),
        );
    } catch (error) {
      if (isConstraintError(error))
        throw new EventSequenceError(event.runId, event.sequence, lastSequence);
      throw error;
    }
  }

  public async listEvents(runId: string): Promise<readonly RuntimeEvent[]> {
    if (!(await this.get(runId))) throw new RunNotFoundError(runId);
    const rows = this.database
      .prepare(
        "SELECT * FROM runtime_events WHERE run_id = ? ORDER BY sequence ASC",
      )
      .all(runId) as unknown as EventRow[];
    return rows.map(toEvent);
  }

  /** 应用退出时关闭 SQLite 连接。 */
  public close(): void {
    this.database.close();
  }
}

function toRun(row: RunRow): AgentRun {
  return {
    runId: row.run_id,
    status: row.status,
    attempt: row.attempt,
    version: row.version,
    createdAt: row.created_at,
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
  };
}
function toEvent(row: EventRow): RuntimeEvent {
  return {
    runId: row.run_id,
    sequence: row.sequence,
    type: row.type,
    occurredAt: row.occurred_at,
    ...(row.data_json === null
      ? {}
      : { data: JSON.parse(row.data_json) as Record<string, unknown> }),
  };
}
function isConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toLowerCase().includes("constraint")
  );
}
