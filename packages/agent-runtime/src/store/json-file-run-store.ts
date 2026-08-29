import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canTransition } from "../lifecycle.js";
import type { AgentRun, RuntimeEvent } from "../types/index.js";
import {
  DuplicateRunError,
  EventSequenceError,
  RunNotFoundError,
  RunVersionConflictError,
} from "./errors.js";
import { filterEvents, type ListEventsOptions } from "./event-query.js";
import {
  type ListRunsOptions,
  paginateRuns,
  type RunPage,
} from "./run-query.js";
import type { RunStore } from "./run-store.js";

interface PersistedRuntimeData {
  readonly runs: AgentRun[];
  readonly events: RuntimeEvent[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * JSON 文件版 RunStore，仅用于学习持久化和进程重启恢复。
 * 生产环境仍需要数据库事务和跨进程并发控制。
 */
export class JsonFileRunStore implements RunStore {
  private readonly runs = new Map<string, AgentRun>();
  private readonly events = new Map<string, RuntimeEvent[]>();
  private readonly loaded: Promise<void>;
  private operation: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {
    this.loaded = this.load();
  }

  public async create(run: AgentRun): Promise<void> {
    return this.exclusive(async () => {
      if (this.runs.has(run.runId)) throw new DuplicateRunError(run.runId);
      this.runs.set(run.runId, clone(run));
      this.events.set(run.runId, []);
      try {
        await this.persist();
      } catch (error) {
        this.runs.delete(run.runId);
        this.events.delete(run.runId);
        throw error;
      }
    });
  }

  public async createWithEvent(
    run: AgentRun,
    event: RuntimeEvent,
  ): Promise<void> {
    return this.exclusive(async () => {
      if (this.runs.has(run.runId)) throw new DuplicateRunError(run.runId);
      validateInitialEvent(run, event);
      this.runs.set(run.runId, clone(run));
      this.events.set(run.runId, [clone(event)]);
      try {
        await this.persist();
      } catch (error) {
        this.runs.delete(run.runId);
        this.events.delete(run.runId);
        throw error;
      }
    });
  }

  public async get(runId: string): Promise<AgentRun | undefined> {
    await this.loaded;
    const run = this.runs.get(runId);
    return run === undefined ? undefined : clone(run);
  }

  public async transition(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
  ): Promise<AgentRun> {
    return this.exclusive(async () => {
      const current = this.requireRun(runId);
      if (current.version !== expectedVersion) {
        throw new RunVersionConflictError(
          runId,
          expectedVersion,
          current.version,
        );
      }
      if (next.runId !== runId)
        throw new Error(`AgentRun id mismatch: ${runId} -> ${next.runId}`);
      if (!canTransition(current.status, next.status)) {
        throw new Error(
          `Invalid AgentRun transition: ${current.status} -> ${next.status}`,
        );
      }
      if (next.version !== current.version + 1) {
        throw new RunVersionConflictError(
          runId,
          current.version + 1,
          next.version,
        );
      }
      const previousRun = clone(current);
      this.runs.set(runId, clone(next));
      try {
        await this.persist();
      } catch (error) {
        this.runs.set(runId, previousRun);
        throw error;
      }
      return clone(next);
    });
  }

  public async transitionWithEvent(
    runId: string,
    expectedVersion: number,
    next: AgentRun,
    event: RuntimeEvent,
  ): Promise<AgentRun> {
    return this.exclusive(async () => {
      const current = this.requireRun(runId);
      if (current.version !== expectedVersion) {
        throw new RunVersionConflictError(
          runId,
          expectedVersion,
          current.version,
        );
      }
      if (next.runId !== runId)
        throw new Error(`AgentRun id mismatch: ${runId} -> ${next.runId}`);
      if (!canTransition(current.status, next.status)) {
        throw new Error(
          `Invalid AgentRun transition: ${current.status} -> ${next.status}`,
        );
      }
      if (next.version !== current.version + 1) {
        throw new RunVersionConflictError(
          runId,
          current.version + 1,
          next.version,
        );
      }
      if (event.runId !== runId)
        throw new Error(`RuntimeEvent id mismatch: ${runId} -> ${event.runId}`);
      const runEvents = this.events.get(runId);
      if (!runEvents) throw new RunNotFoundError(runId);
      const lastSequence = runEvents.at(-1)?.sequence ?? -1;
      if (event.sequence <= lastSequence) {
        throw new EventSequenceError(runId, event.sequence, lastSequence);
      }

      const previousRun = clone(current);
      const previousEvents = clone(runEvents);
      this.runs.set(runId, clone(next));
      runEvents.push(clone(event));
      try {
        await this.persist();
      } catch (error) {
        this.runs.set(runId, previousRun);
        this.events.set(runId, previousEvents);
        throw error;
      }
      return clone(next);
    });
  }

  public async appendEvent(event: RuntimeEvent): Promise<void> {
    return this.exclusive(async () => {
      const runEvents = this.events.get(event.runId);
      if (!runEvents) throw new RunNotFoundError(event.runId);
      const lastSequence = runEvents.at(-1)?.sequence ?? -1;
      if (event.sequence <= lastSequence) {
        throw new EventSequenceError(event.runId, event.sequence, lastSequence);
      }
      runEvents.push(clone(event));
      try {
        await this.persist();
      } catch (error) {
        runEvents.pop();
        throw error;
      }
    });
  }

  public async listEvents(
    runId: string,
    options: ListEventsOptions = {},
  ): Promise<readonly RuntimeEvent[]> {
    await this.loaded;
    const runEvents = this.events.get(runId);
    if (!runEvents) throw new RunNotFoundError(runId);
    return clone(filterEvents(runEvents, options));
  }

  public async listRuns(options: ListRunsOptions = {}): Promise<RunPage> {
    await this.loaded;
    return clone(paginateRuns([...this.runs.values()], options));
  }

  private requireRun(runId: string): AgentRun {
    const run = this.runs.get(runId);
    if (!run) throw new RunNotFoundError(runId);
    return run;
  }

  private async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const data = JSON.parse(content) as PersistedRuntimeData;
      for (const run of data.runs) {
        this.runs.set(run.runId, clone(run));
        this.events.set(run.runId, []);
      }
      for (const event of data.events) {
        this.events.get(event.runId)?.push(clone(event));
      }
    } catch (error) {
      if (isFileMissing(error)) return;
      throw error;
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const data: PersistedRuntimeData = {
      runs: [...this.runs.values()].map(clone),
      events: [...this.events.values()].flat().map(clone),
    };
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(data, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, this.filePath);
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    await this.loaded;
    const previous = this.operation;
    let release!: () => void;
    this.operation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function isFileMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function validateInitialEvent(run: AgentRun, event: RuntimeEvent): void {
  if (event.runId !== run.runId) {
    throw new Error(`RuntimeEvent id mismatch: ${run.runId} -> ${event.runId}`);
  }
  if (event.sequence !== 0) {
    throw new Error(`Initial event sequence must be 0: ${event.sequence}`);
  }
}
