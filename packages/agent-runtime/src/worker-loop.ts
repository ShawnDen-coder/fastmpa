import type { RunLeaseStore } from "./store/index.js";
import type { AgentRun } from "./types/index.js";

export interface RuntimeWorker {
  recoverAndRun(limit: number): Promise<readonly string[]>;
  run(runId: string): Promise<AgentRun | undefined>;
}

export interface RuntimeWorkerLoopOptions {
  readonly worker: RuntimeWorker;
  readonly store: RunLeaseStore;
  readonly batchSize?: number;
  readonly pollIntervalMs?: number;
  readonly setInterval?: typeof setInterval;
  readonly clearInterval?: typeof clearInterval;
  readonly onError?: (error: unknown) => void;
}

/**
 * 持久化 Runtime 的后台消费循环：恢复过期 Run，再消费 queued Run。
 * 它不创建 Run，也不理解 Workspace/业务规则。
 */
export class RuntimeWorkerLoop {
  private readonly startInterval: typeof setInterval;
  private readonly stopInterval: typeof clearInterval;
  private timer: ReturnType<typeof setInterval> | undefined;
  private cycle: Promise<readonly string[]> | undefined;

  public constructor(private readonly options: RuntimeWorkerLoopOptions) {
    this.startInterval = options.setInterval ?? setInterval;
    this.stopInterval = options.clearInterval ?? clearInterval;
  }

  /** 执行一次非重入扫描；返回本轮尝试处理的 Run ID。 */
  public tick(): Promise<readonly string[]> {
    if (this.cycle) return this.cycle;
    this.cycle = this.runCycle().finally(() => {
      this.cycle = undefined;
    });
    return this.cycle;
  }

  public start(): void {
    if (this.timer) return;
    const pollIntervalMs = this.options.pollIntervalMs ?? 1_000;
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1)
      throw new Error(
        "Runtime worker pollIntervalMs must be a positive integer",
      );
    this.timer = this.startInterval(() => {
      void this.tick().catch((error) => this.options.onError?.(error));
    }, pollIntervalMs);
  }

  public stop(): void {
    if (!this.timer) return;
    this.stopInterval(this.timer);
    this.timer = undefined;
  }

  private async runCycle(): Promise<readonly string[]> {
    const batchSize = this.options.batchSize ?? 10;
    if (!Number.isInteger(batchSize) || batchSize < 1)
      throw new Error("Runtime worker batchSize must be a positive integer");
    const handled = [...(await this.options.worker.recoverAndRun(batchSize))];
    const queued = await this.options.store.listRuns({
      status: "queued",
      limit: batchSize,
    });
    for (const run of queued.runs) {
      if (handled.includes(run.runId)) continue;
      await this.runOne(run);
      handled.push(run.runId);
    }
    return handled;
  }

  private async runOne(run: AgentRun): Promise<void> {
    try {
      await this.options.worker.run(run.runId);
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}
