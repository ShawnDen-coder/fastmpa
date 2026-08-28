import { runTurn, type TurnStatus } from "agent-core";
import { RunAlreadyActiveError } from "./errors";
import { transition } from "./lifecycle";
import type { RunStore } from "./store";
import type { AgentRun, RunStatus, RuntimeEvent, StartRunInput } from "./types";

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
    if (this.activeRuns.has(input.runId)) {
      throw new RunAlreadyActiveError(input.runId);
    }

    const controller = new AbortController();
    const removeExternalCancellation = this.linkExternalCancellation(input, controller);
    // 必须在第一次 await 前登记，避免两个 startRun 同时通过检查。
    this.activeRuns.set(input.runId, controller);

    let running: AgentRun | undefined;
    try {
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

      running = await this.store.transition(input.runId, initial.version, {
        ...initial,
        status: transition(initial.status, "running"),
        version: 1,
        startedAt: now,
      });
      await this.store.appendEvent(this.event(input.runId, 1, "run_started", now));

      // 用 Runtime 自己的信号覆盖输入信号，才能支持 cancelRun()。
      const result = await runTurn(
        { ...input.turn, signal: controller.signal },
        input,
      );
      let sequence = 2;
      for (const turnEvent of result.events) {
        await this.store.appendEvent(
          this.event(input.runId, sequence++, `turn.${turnEvent.type}`, now, turnEvent),
        );
      }

      const status = mapTurnStatus(result.status);
      const finishedAt = new Date().toISOString();
      if (status === "failed") {
        await this.store.appendEvent(
          this.event(input.runId, sequence, "run_failed", finishedAt, {
            message: result.error?.message ?? "Turn failed",
          }),
        );
      }
      if (status === "cancelled") {
        await this.store.appendEvent(
          this.event(input.runId, sequence, "run_cancelled", finishedAt),
        );
      }

      return this.store.transition(input.runId, running.version, {
        ...running,
        status: transition(running.status, status),
        version: running.version + 1,
        finishedAt,
      });
    } catch (error) {
      // Run 尚未进入 running 时（例如 create 失败）不伪造 failed 状态。
      if (!running) throw error;

      const failedAt = new Date().toISOString();
      const failed: AgentRun = {
        ...running,
        status: transition(running.status, "failed"),
        version: running.version + 1,
        finishedAt: failedAt,
      };
      await this.store.appendEvent(
        this.event(input.runId, 2, "run_failed", failedAt, {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return this.store.transition(input.runId, running.version, failed);
    } finally {
      removeExternalCancellation();
      this.activeRuns.delete(input.runId);
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
