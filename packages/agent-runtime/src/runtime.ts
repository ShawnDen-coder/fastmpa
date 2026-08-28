import { runTurn, type TurnStatus } from "agent-core";
import { transition } from "./lifecycle";
import type { RunStore } from "./store";
import type { AgentRun, RunStatus, RuntimeEvent, StartRunInput } from "./types";

/**
 * 最小 Runtime 编排器。
 *
 * 它负责把一次 Turn 放进 AgentRun 生命周期，并把 Core 事件转换成
 * RuntimeEvent 写入 Store。模型、工具和持久化实现都通过依赖注入提供。
 */
export class AgentRuntime {
  public constructor(private readonly store: RunStore) {}

  /** 创建并执行一次 Run；当前版本会等待 Turn 完成后返回最终快照。 */
  public async startRun(input: StartRunInput): Promise<AgentRun> {
    const now = new Date().toISOString();
    const initial: AgentRun = {
      runId: input.runId,
      status: "queued",
      attempt: 1,
      version: 0,
      createdAt: now,
    };

    // create 失败时直接向上抛出，因此不会误调用 Core。
    await this.store.create(initial);
    await this.store.appendEvent(this.event(input.runId, 0, "run_queued", now));

    const running = await this.store.transition(input.runId, initial.version, {
      ...initial,
      status: transition(initial.status, "running"),
      version: 1,
      startedAt: now,
    });
    await this.store.appendEvent(this.event(input.runId, 1, "run_started", now));

    try {
      const result = await runTurn(input.turn, input);
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
      return this.store.transition(input.runId, running.version, {
        ...running,
        status: transition(running.status, status),
        version: running.version + 1,
        finishedAt,
      });
    } catch (error) {
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
    }
  }

  /** 查询 Run 当前快照；后续恢复、取消和 API 都会复用这个入口。 */
  public getRun(runId: string): Promise<AgentRun | undefined> {
    return this.store.get(runId);
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


