import {
  runTurn,
  type TurnResult,
  type TurnStatus,
} from "@shawnden-coder/agent-core";
import { RunAlreadyActiveError, RunNotResumableError } from "./errors.js";
import { transition } from "./lifecycle.js";
import { noRetry, shouldRetry } from "./retry.js";
import { RunStoreError } from "./store/errors.js";
import type { ListEventsOptions, RunStore } from "./store/index.js";
import { RunNotFoundError } from "./store/index.js";
import type {
  AgentRun,
  Clock,
  PersistedRunInput,
  ResumeRunInput,
  RunSnapshot,
  RunStatus,
  RuntimeEvent,
  StartRunInput,
} from "./types/index.js";
import { systemClock } from "./types/index.js";

type RunExecutionInput = StartRunInput | ResumeRunInput;
type TurnRunStatus =
  | "completed"
  | "waiting"
  | "blocked"
  | "cancelled"
  | "failed";

export interface RuntimeDependencies {
  /** 可注入的时间来源；默认使用系统时钟。 */
  readonly clock?: Clock;
}

interface ExecutionContext {
  readonly controller: AbortController;
  readonly removeExternalCancellation: () => void;
}

interface RetryExecutionResult {
  readonly run: AgentRun;
  readonly result: TurnResult;
  readonly nextSequence: number;
}

interface TransitionRecordResult {
  readonly run: AgentRun;
  readonly nextSequence: number;
}

/** Runtime 编排器：管理 Run 生命周期、取消、重试、恢复，并把 Core 事件写入 Store。 */
export class AgentRuntime {
  /** 正在启动或执行的 Run；同一 runId 同时只能有一个执行者。 */
  private readonly activeRuns = new Map<string, AbortController>();
  private readonly clock: Clock;

  public constructor(
    private readonly store: RunStore,
    dependencies: RuntimeDependencies = {},
  ) {
    this.clock = dependencies.clock ?? systemClock;
  }

  /** 创建并执行一次 Run；当前版本会等待 Turn 完成后返回最终快照。 */
  public async startRun(input: StartRunInput): Promise<AgentRun> {
    this.ensureRunAvailable(input.runId);
    const execution = this.prepareExecution(input.runId, input);
    let running: AgentRun | undefined;

    try {
      running = await this.createAndStartRun(input);
      const executed = await this.executeWithRetry(
        input,
        input.runId,
        running,
        execution.controller,
      );
      return this.finishRun(
        executed.run,
        input.runId,
        executed.result,
        executed.nextSequence,
      );
    } catch (error) {
      if (!running || error instanceof RunStoreError) throw error;
      return this.failActiveRun(input.runId, error);
    } finally {
      this.cleanupExecution(input.runId, execution);
    }
  }

  /** 从 waiting 或 blocked Run 创建新的执行尝试。 */
  public async resumeRun(
    runId: string,
    input: ResumeRunInput,
  ): Promise<AgentRun> {
    this.ensureRunAvailable(runId);
    const execution = this.prepareExecution(runId, input);
    let running: AgentRun | undefined;
    let sequence = 0;

    try {
      const current = await this.store.get(runId);
      if (!current) throw new RunNotFoundError(runId);
      if (current.status !== "waiting" && current.status !== "blocked") {
        throw new RunNotResumableError(runId, current.status);
      }

      const events = await this.store.listEvents(runId);
      sequence = (events.at(-1)?.sequence ?? -1) + 1;
      const queued = await this.transitionAndRecord(
        current,
        "queued",
        runId,
        sequence,
        "run_resumed",
      );
      sequence = queued.nextSequence;
      const started = await this.transitionAndRecord(
        queued.run,
        "running",
        runId,
        sequence,
        "run_started",
        { attempt: queued.run.attempt + 1 },
        {
          attempt: queued.run.attempt + 1,
          startedAt: this.clock.now(),
        },
      );
      running = started.run;
      sequence = started.nextSequence;

      const executed = await this.executeWithRetry(
        input,
        runId,
        running,
        execution.controller,
        sequence,
      );
      return this.finishRun(
        executed.run,
        runId,
        executed.result,
        executed.nextSequence,
      );
    } catch (error) {
      if (!running || error instanceof RunStoreError) throw error;
      return this.failActiveRun(runId, error);
    } finally {
      this.cleanupExecution(runId, execution);
    }
  }

  /** 查询 Run 当前快照。 */
  public getRun(runId: string): Promise<AgentRun | undefined> {
    return this.store.get(runId);
  }

  /** 查询指定 Run 的全部事件。 */
  public listEvents(
    runId: string,
    options: ListEventsOptions = {},
  ): Promise<readonly RuntimeEvent[]> {
    return this.store.listEvents(runId, options);
  }

  /** 查询 Run 和事件历史组成的只读快照。 */
  public async getRunSnapshot(runId: string): Promise<RunSnapshot | undefined> {
    const run = await this.store.get(runId);
    if (!run) return undefined;
    return { run, events: await this.store.listEvents(runId) };
  }
  /** 请求取消正在启动或执行的 Run；没有活跃执行时返回 false。 */
  public cancelRun(runId: string): boolean {
    const controller = this.activeRuns.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  private ensureRunAvailable(runId: string): void {
    if (this.activeRuns.has(runId)) throw new RunAlreadyActiveError(runId);
  }

  private prepareExecution(
    runId: string,
    input: RunExecutionInput,
  ): ExecutionContext {
    const controller = new AbortController();
    const removeExternalCancellation = this.linkExternalCancellation(
      input,
      controller,
    );
    this.activeRuns.set(runId, controller);
    return { controller, removeExternalCancellation };
  }

  private async createAndStartRun(input: StartRunInput): Promise<AgentRun> {
    const now = this.clock.now();
    const initial: AgentRun = {
      runId: input.runId,
      status: "queued",
      attempt: 1,
      version: 0,
      createdAt: now,
      input: toPersistedRunInput(input),
    };

    await this.store.create(initial);
    await this.store.appendEvent(this.event(input.runId, 0, "run_queued", now));
    return (
      await this.transitionAndRecord(
        initial,
        "running",
        input.runId,
        1,
        "run_started",
        { startedAt: now },
        { startedAt: now },
      )
    ).run;
  }

  private executeTurn(
    input: RunExecutionInput,
    controller: AbortController,
  ): Promise<TurnResult> {
    return runTurn({ ...input.turn, signal: controller.signal }, input);
  }

  /** 执行 Turn，并在满足策略时重试，直到得到最终结果。 */
  private async executeWithRetry(
    input: RunExecutionInput,
    runId: string,
    initialRun: AgentRun,
    controller: AbortController,
    initialSequence = 2,
  ): Promise<RetryExecutionResult> {
    const retryPolicy = input.retryPolicy ?? noRetry;
    let running = initialRun;
    let nextSequence = initialSequence;

    while (true) {
      const result = await this.executeTurn(input, controller);
      nextSequence = await this.appendTurnEvents(runId, result, nextSequence);

      if (
        result.status !== "failed" ||
        !shouldRetry(result.error, running.attempt, retryPolicy, result)
      ) {
        return { run: running, result, nextSequence };
      }

      const retrying = await this.transitionAndRecord(
        running,
        "retrying",
        runId,
        nextSequence,
        "run_retrying",
        { attempt: running.attempt },
      );
      nextSequence = retrying.nextSequence;
      const delayCompleted = await this.delay(
        retryPolicy.delayMs ?? 0,
        controller.signal,
      );
      if (!delayCompleted) {
        return {
          run: running,
          result: { status: "cancelled", messages: [], events: [], steps: 0 },
          nextSequence,
        };
      }
      const restarted = await this.transitionAndRecord(
        retrying.run,
        "running",
        runId,
        nextSequence,
        "run_restarted",
        { attempt: retrying.run.attempt + 1 },
        { attempt: retrying.run.attempt + 1 },
      );
      running = restarted.run;
      nextSequence = restarted.nextSequence;
    }
  }

  private async appendTurnEvents(
    runId: string,
    result: TurnResult,
    sequence: number,
  ): Promise<number> {
    const occurredAt = this.clock.now();
    for (const turnEvent of result.events) {
      await this.store.appendEvent(
        this.event(
          runId,
          sequence++,
          `turn.${turnEvent.type}`,
          occurredAt,
          turnEvent,
        ),
      );
    }
    return sequence;
  }

  private async finishRun(
    running: AgentRun,
    runId: string,
    result: TurnResult,
    sequence: number,
  ): Promise<AgentRun> {
    const current = await this.store.get(runId);
    if (!current) {
      throw new RunNotFoundError(runId);
    }
    if (
      current.status === "completed" ||
      current.status === "cancelled" ||
      current.status === "failed"
    ) {
      return current;
    }
    const events = await this.store.listEvents(runId);
    running = current;
    sequence = Math.max(sequence, (events.at(-1)?.sequence ?? -1) + 1);

    const status = mapTurnStatus(result.status);
    switch (status) {
      case "failed":
        return (
          await this.transitionAndRecord(
            running,
            status,
            runId,
            sequence,
            "run_failed",
            { message: result.error?.message ?? "Turn failed" },
            { finishedAt: this.clock.now() },
          )
        ).run;
      case "cancelled":
        return (
          await this.transitionAndRecord(
            running,
            status,
            runId,
            sequence,
            "run_cancelled",
            undefined,
            { finishedAt: this.clock.now() },
          )
        ).run;
      case "completed":
        return (
          await this.transitionAndRecord(
            running,
            status,
            runId,
            sequence,
            "run_completed",
            undefined,
            { finishedAt: this.clock.now() },
          )
        ).run;
      case "waiting":
      case "blocked":
        return (
          await this.transitionAndRecord(
            running,
            status,
            runId,
            sequence,
            `run_${status}`,
          )
        ).run;
    }
  }

  private async failRun(
    running: AgentRun,
    runId: string,
    error: unknown,
    sequence: number,
  ): Promise<AgentRun> {
    return (
      await this.transitionAndRecord(
        running,
        "failed",
        runId,
        sequence,
        "run_failed",
        { message: error instanceof Error ? error.message : String(error) },
        { finishedAt: this.clock.now() },
      )
    ).run;
  }

  /** Use the latest Store snapshot so cleanup cannot mask the original error. */
  private async failActiveRun(
    runId: string,
    error: unknown,
  ): Promise<AgentRun> {
    const current = await this.store.get(runId);
    if (!current) throw error;
    if (
      current.status === "completed" ||
      current.status === "cancelled" ||
      current.status === "failed"
    ) {
      return current;
    }
    const events = await this.store.listEvents(runId);
    const nextSequence = (events.at(-1)?.sequence ?? -1) + 1;
    return this.failRun(current, runId, error, nextSequence);
  }
  /** 统一处理“状态转换 + 生命周期事件”；当前仍使用两个 Store 操作。 */
  private async transitionAndRecord(
    current: AgentRun,
    nextStatus: RunStatus,
    runId: string,
    sequence: number,
    eventType?: string,
    eventData?: Readonly<Record<string, unknown>>,
    patch: Partial<AgentRun> = {},
  ): Promise<TransitionRecordResult> {
    const occurredAt = this.clock.now();
    const next: AgentRun = {
      ...current,
      ...patch,
      status: transition(current.status, nextStatus),
      version: current.version + 1,
    };
    if (eventType) {
      const event = this.event(
        runId,
        sequence,
        eventType,
        occurredAt,
        eventData,
      );
      const updated = this.store.transitionWithEvent
        ? await this.store.transitionWithEvent(
            runId,
            current.version,
            next,
            event,
          )
        : await this.store.transition(runId, current.version, next);
      if (!this.store.transitionWithEvent) await this.store.appendEvent(event);
      return { run: updated, nextSequence: sequence + 1 };
    }
    const updated = await this.store.transition(runId, current.version, next);
    return { run: updated, nextSequence: sequence };
  }

  private async delay(delayMs: number, signal: AbortSignal): Promise<boolean> {
    if (delayMs <= 0) return !signal.aborted;
    if (signal.aborted) return false;
    return new Promise<boolean>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(false);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve(true);
      }, delayMs);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private cleanupExecution(runId: string, execution: ExecutionContext): void {
    execution.removeExternalCancellation();
    this.activeRuns.delete(runId);
  }

  private linkExternalCancellation(
    input: RunExecutionInput,
    controller: AbortController,
  ): () => void {
    const signal = input.turn.signal;
    if (!signal) return () => undefined;
    const onAbort = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener?.("abort", onAbort);
    return () => signal.removeEventListener?.("abort", onAbort);
  }

  private event(
    runId: string,
    sequence: number,
    type: string,
    occurredAt: string,
    data?: Readonly<Record<string, unknown>>,
  ): RuntimeEvent {
    return {
      runId,
      sequence,
      type,
      occurredAt,
      ...(data === undefined ? {} : { data }),
    };
  }
}

/** 将 Core 的 TurnStatus 映射为 Runtime 的 RunStatus。 */
function toPersistedRunInput(input: StartRunInput): PersistedRunInput {
  const { signal: _signal, ...turn } = input.turn;
  return {
    turn,
    ...(input.retryPolicy === undefined
      ? {}
      : { retryPolicy: input.retryPolicy }),
  };
}
function mapTurnStatus(status: TurnStatus): TurnRunStatus {
  switch (status) {
    case "done":
      return "completed";
    case "waiting":
    case "needs_clarification":
      return "waiting";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}
