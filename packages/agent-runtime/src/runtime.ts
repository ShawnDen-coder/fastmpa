import { runTurn, type TurnResult, type TurnStatus } from "agent-core";
import { RunAlreadyActiveError } from "./errors";
import { transition } from "./lifecycle";
import type { RunStore } from "./store";
import type { AgentRun, RunStatus, RuntimeEvent, StartRunInput } from "./types";

interface ExecutionContext {
  readonly controller: AbortController;
  readonly removeExternalCancellation: () => void;
}

/**
 * Runtime 的最小编排器：管理 Run 生命周期，并把 Core 事件写入 Store。
 * 模型、工具和持久化实现都通过依赖注入提供。
 */
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
      const result = await this.executeTurn(input, execution.controller);
      return this.finishRun(running, input.runId, result);
    } catch (error) {
      // Run 尚未进入 running 时（例如 create 失败）不伪造 failed 状态。
      if (!running) throw error;
      return this.failRun(running, input.runId, error);
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

  /** 检查 runId 是否已被其他执行流程占用。 */
  private ensureRunAvailable(runId: string): void {
    if (this.activeRuns.has(runId)) {
      throw new RunAlreadyActiveError(runId);
    }
  }

  /** 创建取消控制器、连接外部 signal，并立即登记活跃 Run。 */
  private prepareExecution(input: StartRunInput): ExecutionContext {
    const controller = new AbortController();
    const removeExternalCancellation = this.linkExternalCancellation(input, controller);
    // 必须在第一次 await 前登记，避免两个 startRun 同时通过检查。
    this.activeRuns.set(input.runId, controller);
    return { controller, removeExternalCancellation };
  }

  /** 创建 queued Run，转为 running，并写入生命周期事件。 */
  private async createAndStartRun(input: StartRunInput): Promise<AgentRun> {
    const now = new Date().toISOString();
    const initial: AgentRun = {
      runId: input.runId,
      status: "queued",
      attempt: 1,
      version: 0,
      createdAt: now,
    };

    // 创建失败直接向上抛出，因此不会误调用 Core。
    await this.store.create(initial);
    await this.store.appendEvent(this.event(input.runId, 0, "run_queued", now));

    const running = await this.store.transition(input.runId, initial.version, {
      ...initial,
      status: transition(initial.status, "running"),
      version: 1,
      startedAt: now,
    });
    await this.store.appendEvent(this.event(input.runId, 1, "run_started", now));
    return running;
  }

  /** 调用 agent-core，并注入 Runtime 管理的取消信号。 */
  private executeTurn(
    input: StartRunInput,
    controller: AbortController,
  ): Promise<TurnResult> {
    return runTurn(
      { ...input.turn, signal: controller.signal },
      input,
    );
  }

  /** 保存 Turn 事件，映射最终状态，并更新 Run。 */
  private async finishRun(
    running: AgentRun,
    runId: string,
    result: TurnResult,
  ): Promise<AgentRun> {
    const occurredAt = new Date().toISOString();
    let sequence = 2;
    for (const turnEvent of result.events) {
      await this.store.appendEvent(
        this.event(runId, sequence++, `turn.${turnEvent.type}`, occurredAt, turnEvent),
      );
    }

    const status = mapTurnStatus(result.status);
    if (status === "failed") {
      await this.store.appendEvent(
        this.event(runId, sequence, "run_failed", occurredAt, {
          message: result.error?.message ?? "Turn failed",
        }),
      );
    }
    if (status === "cancelled") {
      await this.store.appendEvent(this.event(runId, sequence, "run_cancelled", occurredAt));
    }

    return this.store.transition(runId, running.version, {
      ...running,
      status: transition(running.status, status),
      version: running.version + 1,
      finishedAt: occurredAt,
    });
  }

  /** 将执行阶段抛出的异常转换为 failed Run。 */
  private async failRun(
    running: AgentRun,
    runId: string,
    error: unknown,
  ): Promise<AgentRun> {
    const failedAt = new Date().toISOString();
    const failed: AgentRun = {
      ...running,
      status: transition(running.status, "failed"),
      version: running.version + 1,
      finishedAt: failedAt,
    };
    await this.store.appendEvent(
      this.event(runId, 2, "run_failed", failedAt, {
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return this.store.transition(runId, running.version, failed);
  }

  /** 删除外部监听器和活跃 Run 占用。 */
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
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener?.("abort", onAbort);
    }

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
