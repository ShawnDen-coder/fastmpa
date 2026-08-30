import { and, asc, desc, eq, gt, isNull, lt, lte, or } from "drizzle-orm";
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
import type { RunLease, RunLeaseStore } from "../run-store.js";
import type { SqliteStoreConfig } from "./config.js";
import { openSqliteDatabase, type SqliteDatabase } from "./database.js";
import { agentRuns, runtimeEvents } from "./schema.js";

/** SQLite 版 RunStore；查询、写入和事务均通过 Drizzle 完成。 */
export class SqliteRunStore implements RunLeaseStore {
  private constructor(
    private readonly database: SqliteDatabase,
    private readonly ownsDatabase = true,
  ) {}
  public static async open(config: SqliteStoreConfig): Promise<SqliteRunStore> {
    return new SqliteRunStore(await openSqliteDatabase(config));
  }
  public static fromDatabase(database: SqliteDatabase): SqliteRunStore {
    return new SqliteRunStore(database, false);
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

  /** 原子领取 queued Run、开始执行并记录 run_started。 */
  public async claimAndStart(
    runId: string,
    ownerId: string,
    now: string,
    leaseMs: number,
  ): Promise<RunLease | undefined> {
    if (!Number.isFinite(leaseMs) || leaseMs <= 0)
      throw new Error("leaseMs must be a positive finite number");
    const leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
    return this.database.db.transaction((tx) => {
      const currentRow = tx
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.runId, runId))
        .get();
      const current = currentRow ? toRun(currentRow) : undefined;
      if (!current) throw new RunNotFoundError(runId);
      if (current.status !== "queued") return undefined;
      // SQLite compares ISO-8601 UTC strings lexicographically.
      if (
        currentRow?.leaseUntil !== null &&
        currentRow?.leaseUntil !== undefined &&
        currentRow.leaseUntil >= now
      ) {
        return undefined;
      }

      const last = tx
        .select({ sequence: runtimeEvents.sequence })
        .from(runtimeEvents)
        .where(eq(runtimeEvents.runId, runId))
        .orderBy(desc(runtimeEvents.sequence))
        .get();
      const next: AgentRun = {
        ...current,
        status: "running",
        version: current.version + 1,
        startedAt: now,
      };
      const updated = tx
        .update(agentRuns)
        .set({
          ...toRunRow(next),
          ownerId,
          leaseUntil,
          heartbeatAt: now,
        })
        .where(
          and(
            eq(agentRuns.runId, runId),
            eq(agentRuns.status, "queued"),
            eq(agentRuns.version, current.version),
            or(isNull(agentRuns.leaseUntil), lt(agentRuns.leaseUntil, now)),
          ),
        )
        .run();
      if (updated.changes !== 1) return undefined;
      tx.insert(runtimeEvents)
        .values({
          runId,
          sequence: (last?.sequence ?? -1) + 1,
          type: "run_started",
          occurredAt: now,
          dataJson: JSON.stringify({ attempt: current.attempt, ownerId }),
        })
        .run();
      return { runId, ownerId, leaseUntil };
    });
  }

  /** 仅当前 owner 可续租；过期 lease 不能被原 owner 重新激活。 */
  public async renewLease(
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
      .set({ leaseUntil, heartbeatAt: now })
      .where(
        and(
          eq(agentRuns.runId, runId),
          eq(agentRuns.ownerId, ownerId),
          or(eq(agentRuns.status, "running"), eq(agentRuns.status, "retrying")),
          gt(agentRuns.leaseUntil, now),
        ),
      )
      .run();
    return updated.changes === 1 ? { runId, ownerId, leaseUntil } : undefined;
  }

  /** 由仍持有有效 lease 的 owner 原子地写入状态和生命周期事件。 */
  public async transitionAsOwnerWithEvent(
    runId: string,
    ownerId: string,
    now: string,
    expectedVersion: number,
    next: AgentRun,
    event: RuntimeEvent,
    options: { readonly releaseLease?: boolean } = {},
  ): Promise<AgentRun | undefined> {
    return this.database.db.transaction((tx) => {
      const currentRow = tx
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.runId, runId))
        .get();
      const current = currentRow ? toRun(currentRow) : undefined;
      if (!current) throw new RunNotFoundError(runId);
      validateTransition(current, runId, expectedVersion, next);
      if (event.runId !== runId)
        throw new Error(`RuntimeEvent id mismatch: ${runId} -> ${event.runId}`);
      if (
        currentRow?.ownerId !== ownerId ||
        currentRow.leaseUntil === null ||
        currentRow.leaseUntil <= now
      ) {
        return undefined;
      }
      if (
        options.releaseLease === true &&
        (next.status === "running" || next.status === "retrying")
      ) {
        throw new Error("An executable Run must retain its lease");
      }
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
        .set({
          ...toRunRow(next),
          ...(options.releaseLease === true
            ? { ownerId: null, leaseUntil: null, heartbeatAt: null }
            : {}),
        })
        .where(
          and(
            eq(agentRuns.runId, runId),
            eq(agentRuns.ownerId, ownerId),
            eq(agentRuns.version, expectedVersion),
            gt(agentRuns.leaseUntil, now),
          ),
        )
        .run();
      if (updated.changes !== 1) return undefined;
      tx.insert(runtimeEvents).values(toEventRow(event)).run();
      return next;
    });
  }

  /** 在同一事务内校验 lease 并追加一批 Turn 事件。 */
  public async appendEventsAsOwner(
    runId: string,
    ownerId: string,
    now: string,
    events: readonly RuntimeEvent[],
  ): Promise<boolean> {
    if (events.length === 0) return true;
    return this.database.db.transaction((tx) => {
      const currentRow = tx
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.runId, runId))
        .get();
      if (!currentRow) throw new RunNotFoundError(runId);
      if (
        currentRow.ownerId !== ownerId ||
        currentRow.leaseUntil === null ||
        currentRow.leaseUntil <= now
      ) {
        return false;
      }
      const last = tx
        .select({ sequence: runtimeEvents.sequence })
        .from(runtimeEvents)
        .where(eq(runtimeEvents.runId, runId))
        .orderBy(desc(runtimeEvents.sequence))
        .get();
      let lastSequence = last?.sequence ?? -1;
      for (const event of events) {
        if (event.runId !== runId)
          throw new Error(
            `RuntimeEvent id mismatch: ${runId} -> ${event.runId}`,
          );
        if (event.sequence <= lastSequence)
          throw new EventSequenceError(runId, event.sequence, lastSequence);
        tx.insert(runtimeEvents).values(toEventRow(event)).run();
        lastSequence = event.sequence;
      }
      return true;
    });
  }

  /** 将已失去 owner 的执行 Run 以 interrupted → queued 两步原子恢复。 */
  public async recoverExpiredRuns(
    now: string,
    limit: number,
  ): Promise<readonly string[]> {
    if (!Number.isInteger(limit) || limit <= 0)
      throw new RangeError("limit must be a positive integer");
    const candidates = this.database.db
      .select({ runId: agentRuns.runId })
      .from(agentRuns)
      .where(
        and(
          or(eq(agentRuns.status, "running"), eq(agentRuns.status, "retrying")),
          lte(agentRuns.leaseUntil, now),
        ),
      )
      .limit(limit)
      .all();

    const recovered: string[] = [];
    for (const candidate of candidates) {
      const changed = this.database.db.transaction((tx) => {
        const currentRow = tx
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.runId, candidate.runId))
          .get();
        const current = currentRow ? toRun(currentRow) : undefined;
        if (
          !currentRow ||
          !current ||
          (current.status !== "running" && current.status !== "retrying") ||
          currentRow.leaseUntil === null ||
          currentRow.leaseUntil > now
        ) {
          return false;
        }
        const last = tx
          .select({ sequence: runtimeEvents.sequence })
          .from(runtimeEvents)
          .where(eq(runtimeEvents.runId, current.runId))
          .orderBy(desc(runtimeEvents.sequence))
          .get();
        const interrupted: AgentRun = {
          ...current,
          status: "interrupted",
          version: current.version + 1,
        };
        const interruptedUpdate = tx
          .update(agentRuns)
          .set({
            ...toRunRow(interrupted),
            ownerId: null,
            leaseUntil: null,
            heartbeatAt: null,
          })
          .where(
            and(
              eq(agentRuns.runId, current.runId),
              eq(agentRuns.version, current.version),
              lte(agentRuns.leaseUntil, now),
            ),
          )
          .run();
        if (interruptedUpdate.changes !== 1) return false;
        const interruptedSequence = (last?.sequence ?? -1) + 1;
        tx.insert(runtimeEvents)
          .values({
            runId: current.runId,
            sequence: interruptedSequence,
            type: "run_interrupted",
            occurredAt: now,
            dataJson: JSON.stringify({ reason: "lease_expired" }),
          })
          .run();
        const queued: AgentRun = {
          ...interrupted,
          status: "queued",
          attempt: interrupted.attempt + 1,
          version: interrupted.version + 1,
        };
        tx.update(agentRuns)
          .set(toRunRow(queued))
          .where(
            and(
              eq(agentRuns.runId, current.runId),
              eq(agentRuns.version, interrupted.version),
            ),
          )
          .run();
        tx.insert(runtimeEvents)
          .values({
            runId: current.runId,
            sequence: interruptedSequence + 1,
            type: "run_requeued",
            occurredAt: now,
            dataJson: JSON.stringify({ attempt: queued.attempt }),
          })
          .run();
        return true;
      });
      if (changed) recovered.push(candidate.runId);
    }
    return recovered;
  }

  /** 应用退出时关闭 SQLite 连接。 */
  public close(): void {
    if (this.ownsDatabase) this.database.client.close();
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
  const input =
    row.inputJson === null
      ? undefined
      : (JSON.parse(row.inputJson) as AgentRun["input"]);
  return {
    runId: row.runId,
    status: row.status as AgentRun["status"],
    attempt: row.attempt,
    version: row.version,
    ...(input === undefined ? {} : { input }),
    ...(input?.context === undefined ? {} : { context: input.context }),
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
