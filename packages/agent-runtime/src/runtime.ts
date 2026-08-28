import { runTurn, type TurnResult, type TurnStatus } from "agent-core";
import { RunAlreadyActiveError } from "./errors";
import { noRetry, shouldRetry } from "./retry";
import { transition } from "./lifecycle";
import type { RunStore } from "./store";
import type { AgentRun, RunStatus, RuntimeEvent, StartRunInput } from "./types";

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

/** Runtime 编排器：管理 Run 生命周期、取消、重试，并把 Core 事件写入 Store。 */
export class AgentRuntime {
  /** 正在启动或执行的 Run；同一 runId 同时只能有一个执行者。 */
  private readonly activeRuns = new Map<string, AbortController>();

  public constructor(private readonly store: RunStore) {}

  /** 创建并执行一次 Run；当前版本会等待 Turn 完成后返回最终快照。 */
  public async startRun(input: StartRunInput): Promise<AgentRun> {
    this.ensureRunAvailable(input.runId);
    const execution = this.prepareExecution(input);
    let running: AgentRun | undefined;

    try {
      running = await this.createAndStartRun(input);
      const executed = await this.executeWithRetry(input, running, execution.controller);
      return this.finishRun(
        executed.run,
        input.runId,
        executed.result,
        executed.nextSequence,
      );
    } catch (error) {
      // Run 尚未进入 running 时（例如 create 失败）不伪造 failed 状态。
      if (!running) throw error;
      return this.failRun(running, input.runId, error, 2);
    } finally {
      this.cleanupExecution(input.runId, execution);
    }
  }

  /** 查询 Run 当前快照。 */
  public getRun(runId: string): Promise<AgentRun | undefined> {
    return this.store.get(runId);
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

  private prepareExecution(input: StartRunInput): ExecutionContext {
    const controller = new AbortController();
    const removeExternalCancellation = this.linkExternalCancellation(input, controller);
    // 必须在第一次 await 前登记，避免两个 startRun 同时通过检查。
    this.activeRuns.set(input.runId, controller);
    return { controller, removeExternalCancellation };
  }

  private async createAndStartRun(input: StartRunInput): Promise<AgentRun> {
    const now = new Date().toISOString();
    const initial: AgentRun = {
      runId: input.runId,
      status: "queued",
      attempt: 1,
      version: 0,
      createdAt: now,
    };

    await this.store.create(initial);
    await this.store.appendEvent(this.event(input.runId, 0, "run_queued", now));
    const result = await this.transitionAndRecord(
      initial,
      "running",
      input.runId,
      1,
      "run_started",
      { startedAt: now },
      { startedAt: now },
    );
    return result.run;
  }

  private executeTurn(input: StartRunInput, controller: AbortController): Promise<TurnResult> {
    return runTurn({ ...input.turn, signal: controller.signal }, input);
  }

  /** 执行 Turn，并在满足策略时重试，直到得到最终结果。 */
  private async executeWithRetry(
    input: StartRunInput,
    initialRun: AgentRun,
    controller: AbortController,
  ): Promise<RetryExecutionResult> {
    const retryPolicy = input.retryPolicy ?? noRetry;
    let running = initialRun;
    let nextSequence = 2;

    while (true) {
      const result = await this.executeTurn(input, controller);
      nextSequence = await this.appendTurnEvents(input.runId, result, nextSequence);

      if (result.status !== "failed" || !shouldRetry(result.error, running.attempt, retryPolicy)) {
        return { run: running, result, nextSequence };
      }

      const retrying = await this.transitionAndRecord(
        running,
        "retrying",
        input.runId,
        nextSequence,
        "run_retrying",
        { attempt: running.attempt },
      );
      
      nextSequence = retrying.nextSequence;
      await this.delay(retryPolicy.delayMs ?? 0);
      const restarted = await this.transitionAndRecord(
        retrying.run,
        "running",
        input.runId,
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
    const occurredAt = new Date().toISOString();
    for (const turnEvent of result.events) {
      await this.store.appendEvent(
        this.event(runId, sequence++, `turn.${turnEvent.type}`, occurredAt, turnEvent),
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
    const status = mapTurnStatus(result.status);
    if (status === "failed") {
      return (await this.transitionAndRecord(
        running,
        status,
        runId,
        sequence,
        "run_failed",
        { message: result.error?.message ?? "Turn failed" },
        { finishedAt: new Date().toISOString() },
      )).run;
    }
    if (status === "cancelled") {
      return (await this.transitionAndRecord(
        running,
        status,
        runId,
        sequence,
        "run_cancelled",
        undefined,
        { finishedAt: new Date().toISOString() },
      )).run;
    }
    return (await this.transitionAndRecord(
      running,
      status,
      runId,
      sequence,
      undefined,
      undefined,
      { finishedAt: new Date().toISOString() },
    )).run;
  }

  private async failRun(
    running: AgentRun,
    runId: string,
    error: unknown,
    sequence: number,
  ): Promise<AgentRun> {
    return (await this.transitionAndRecord(
      running,
      "failed",
      runId,
      sequence,
      "run_failed",
      { message: error instanceof Error ? error.message : String(error) },
      { finishedAt: new Date().toISOString() },
    )).run;
  }

  /** 统一处理 Runtime 内部重复的“状态转换 + 生命周期事件”流程。 */
  private async transitionAndRecord(
    current: AgentRun,
    nextStatus: RunStatus,
    runId: string,
    sequence: number,
    eventType?: string,
    eventData?: Readonly<Record<string, unknown>>,
    patch: Partial<AgentRun> = {},
  ): Promise<TransitionRecordResult> {
    const occurredAt = new Date().toISOString();
    const next: AgentRun = {
      ...current,
      ...patch,
      status: transition(current.status, nextStatus),
      version: current.version + 1,
    };

    const updated = await this.store.transition(runId, current.version, next);
    if (eventType) {
      await this.store.appendEvent(this.event(runId, sequence, eventType, occurredAt, eventData));
      return { run: updated, nextSequence: sequence + 1 };
    }
    return { run: updated, nextSequence: sequence };
  }

  private async delay(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  private cleanupExecution(runId: string, execution: ExecutionContext): void {
    execution.removeExternalCancellation();
    this.activeRuns.delete(runId);
  }

  private linkExternalCancellation(
    input: StartRunInput,
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
    return { runId, sequence, type, occurredAt, ...(data === undefined ? {} : { data }) };
  }
}

/** 将 Core 的 TurnStatus 映射为 Runtime 的 RunStatus。 */
export function mapTurnStatus(status: TurnStatus): RunStatus {
  switch (status) {
    case "done": return "completed";
    case "waiting":
    case "needs_clarification": return "waiting";
    case "blocked": return "blocked";
    case "cancelled": return "cancelled";
    case "failed": return "failed";
  }
}
