import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { canTransition } from "../../lifecycle.js";
import type { AgentRun, RuntimeEvent } from "../../types/index.js";
import {
  DuplicateRunError,
  EventSequenceError,
  RunNotFoundError,
  RunVersionConflictError,
} from "../errors.js";
import {
  type ListEventsOptions,
  validateListEventsOptions,
} from "../event-query.js";
import {
  type ListRunsOptions,
  paginateRuns,
  type RunPage,
} from "../run-query.js";
import type { RunLease, RunStore } from "../run-store.js";
import type { SqliteStoreConfig } from "./config.js";
import { openSqliteDatabase, type SqliteDatabase } from "./database.js";
import { agentRuns, runtimeEvents } from "./schema.js";

/** SQLite 版 RunStore；查询、写入和事务均通过 Drizzle 完成。 */
export class SqliteRunStore implements RunStore {
  private constructor(private readonly database: SqliteDatabase) {}
  public static async open(config: SqliteStoreConfig): Promise<SqliteRunStore> {
    return new SqliteRunStore(await openSqliteDatabase(config));
  }

  public async create(run: AgentRun): Promise<void> {
    try {
      this.database.db.insert(agentRuns).values(toRunRow(run, true)).run();
    } catch (error) {
      if (isConstraintError(error)) throw new DuplicateRunError(run.runId);
      throw error;
    }
  }

  public async createWithEvent(
    run: AgentRun,
    event: RuntimeEvent,
  ): Promise<void> {
    validateInitialEvent(run, event);
    try {
      this.database.db.transaction((tx) => {
        tx.insert(agentRuns).values(toRunRow(run, true)).run();
        tx.insert(runtimeEvents).values(toEventRow(event)).run();
      });
    } catch (error) {
      if (isConstraintError(error)) throw new DuplicateRunError(run.runId);
      throw error;
    }
  }

  public async get(runId: string): Promise<AgentRun | undefined> {
    const row = this.database.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.runId, runId))
      .get();
    return row ? toRun(row) : undefined;
  }

  public async transition(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
  ): Promise<AgentRun> {
    const current = await this.get(runId);
    validateTransition(current, runId, expectedVersion, next);
    const result = this.database.db
      .update(agentRuns)
      .set(toRunRow(next))
      .where(
        and(eq(agentRuns.runId, runId), eq(agentRuns.version, expectedVersion)),
      )
      .run();
    if (result.changes !== 1)
      throw new RunVersionConflictError(
        runId,
        expectedVersion,
        current?.version ?? expectedVersion,
      );
    return next;
  }

  public async transitionWithEvent(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
    event: RuntimeEvent,
  ): Promise<AgentRun> {
    return this.database.db.transaction((tx) => {
      const currentRow = tx
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.runId, runId))
        .get();
      const current = currentRow ? toRun(currentRow) : undefined;
      validateTransition(current, runId, expectedVersion, next);
      if (event.runId !== runId)
        throw new Error(`RuntimeEvent id mismatch: ${runId} -> ${event.runId}`);
      const last = tx
        .select({ sequence: runtimeEvents.sequence })
        .from(runtimeEvents)
        .where(eq(runtimeEvents.runId, runId))
        .orderBy(desc(runtimeEvents.sequence))
        .get();
      const lastSequence = last?.sequence ?? -1;
      if (event.sequence <= lastSequence)
        throw new EventSequenceError(runId, event.sequence, lastSequence);
      const updated = tx
        .update(agentRuns)
        .set(toRunRow(next))
        .where(
          and(
            eq(agentRuns.runId, runId),
            eq(agentRuns.version, expectedVersion),
          ),
        )
        .run();
      if (updated.changes !== 1)
        throw new RunVersionConflictError(
          runId,
          expectedVersion,
          current?.version ?? expectedVersion,
        );
      tx.insert(runtimeEvents).values(toEventRow(event)).run();
      return next;
    });
  }

  public async appendEvent(event: RuntimeEvent): Promise<void> {
    if (!(await this.get(event.runId))) throw new RunNotFoundError(event.runId);
    const last = this.database.db
      .select({ sequence: runtimeEvents.sequence })
      .from(runtimeEvents)
      .where(eq(runtimeEvents.runId, event.runId))
      .orderBy(desc(runtimeEvents.sequence))
      .get();
    const lastSequence = last?.sequence ?? -1;
    if (event.sequence <= lastSequence)
      throw new EventSequenceError(event.runId, event.sequence, lastSequence);
    try {
      this.database.db.insert(runtimeEvents).values(toEventRow(event)).run();
    } catch (error) {
      if (isConstraintError(error))
        throw new EventSequenceError(event.runId, event.sequence, lastSequence);
      throw error;
    }
  }

  public async listEvents(
    runId: string,
    options: ListEventsOptions = {},
  ): Promise<readonly RuntimeEvent[]> {
    if (!(await this.get(runId))) throw new RunNotFoundError(runId);
    validateListEventsOptions(options);
    const conditions = [eq(runtimeEvents.runId, runId)];
    if (options.type !== undefined)
      conditions.push(eq(runtimeEvents.type, options.type));
    if (options.afterSequence !== undefined)
      conditions.push(gt(runtimeEvents.sequence, options.afterSequence));
    const query = this.database.db
      .select()
      .from(runtimeEvents)
      .where(and(...conditions))
      .orderBy(asc(runtimeEvents.sequence));
    return (options.limit === undefined ? query : query.limit(options.limit))
      .all()
      .map(toEvent);
  }

  public async listRuns(options: ListRunsOptions = {}): Promise<RunPage> {
    return paginateRuns(
      this.database.db.select().from(agentRuns).all().map(toRun),
      options,
    );
  }

  /** Atomically claims a Run whose lease is absent or expired. */
  public async claim(
    runId: string,
    ownerId: string,
    now: string,
    leaseMs: number,
  ): Promise<RunLease | undefined> {
    if (!Number.isFinite(leaseMs) || leaseMs <= 0)
      throw new Error("leaseMs must be a positive finite number");
    const leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
    const updated = this.database.db
      .update(agentRuns)
      .set({ ownerId, leaseUntil, heartbeatAt: now })
      .where(
        and(
          eq(agentRuns.runId, runId),
          eq(agentRuns.status, "queued"),
          // SQLite compares ISO-8601 UTC strings lexicographically.
          or(isNull(agentRuns.leaseUntil), lt(agentRuns.leaseUntil, now)),
        ),
      )
      .run();
    return updated.changes === 1 ? { runId, ownerId, leaseUntil } : undefined;
  }

  /** 应用退出时关闭 SQLite 连接。 */
  public close(): void {
    this.database.client.close();
  }
}

function validateTransition(
  current: AgentRun | undefined,
  runId: string,
  expectedVersion: number,
  next: AgentRun,
): void {
  if (!current) throw new RunNotFoundError(runId);
  if (current.version !== expectedVersion)
    throw new RunVersionConflictError(runId, expectedVersion, current.version);
  if (next.runId !== runId)
    throw new Error(`AgentRun id mismatch: ${runId} -> ${next.runId}`);
  if (!canTransition(current.status, next.status))
    throw new Error(
      `Invalid AgentRun transition: ${current.status} -> ${next.status}`,
    );
  if (next.version !== current.version + 1)
    throw new RunVersionConflictError(runId, current.version + 1, next.version);
}

function validateInitialEvent(run: AgentRun, event: RuntimeEvent): void {
  if (event.runId !== run.runId) {
    throw new Error(`RuntimeEvent id mismatch: ${run.runId} -> ${event.runId}`);
  }
  if (event.sequence !== 0) {
    throw new Error(`Initial event sequence must be 0: ${event.sequence}`);
  }
}

function toRunRow(run: AgentRun, includeLease = false) {
  const row = {
    runId: run.runId,
    status: run.status,
    inputJson: run.input === undefined ? null : JSON.stringify(run.input),
    attempt: run.attempt,
    version: run.version,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    resultJson: run.result === undefined ? null : JSON.stringify(run.result),
    errorJson: run.error === undefined ? null : JSON.stringify(run.error),
  };
  return includeLease
    ? { ...row, ownerId: null, leaseUntil: null, heartbeatAt: null }
    : row;
}
function toEventRow(event: RuntimeEvent) {
  return {
    runId: event.runId,
    sequence: event.sequence,
    type: event.type,
    occurredAt: event.occurredAt,
    dataJson: event.data === undefined ? null : JSON.stringify(event.data),
  };
}
function toRun(row: typeof agentRuns.$inferSelect): AgentRun {
  return {
    runId: row.runId,
    status: row.status as AgentRun["status"],
    attempt: row.attempt,
    version: row.version,
    ...(row.inputJson === null ? {} : { input: JSON.parse(row.inputJson) }),
    createdAt: row.createdAt,
    ...(row.startedAt === null ? {} : { startedAt: row.startedAt }),
    ...(row.finishedAt === null ? {} : { finishedAt: row.finishedAt }),
    ...(row.resultJson === null
      ? {}
      : { result: JSON.parse(row.resultJson) as AgentRun["result"] }),
    ...(row.errorJson === null
      ? {}
      : { error: JSON.parse(row.errorJson) as AgentRun["error"] }),
  };
}
function toEvent(row: typeof runtimeEvents.$inferSelect): RuntimeEvent {
  return {
    runId: row.runId,
    sequence: row.sequence,
    type: row.type,
    occurredAt: row.occurredAt,
    ...(row.dataJson === null
      ? {}
      : { data: JSON.parse(row.dataJson) as Record<string, unknown> }),
  };
}
function isConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String(error.code).startsWith("SQLITE_CONSTRAINT")
  );
}
