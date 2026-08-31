import type { Logger } from "@shawnden-coder/agent-core";
import type { Schedule, WorkspaceRepository } from "workspace";
import type { AgentScheduler, WakeSignal } from "./scheduler.js";

export interface ScheduleRunnerOptions {
  readonly scheduler: AgentScheduler;
  readonly repository: WorkspaceRepository;
  readonly dispatch?: (signal: WakeSignal) => Promise<unknown>;
  readonly onError?: (error: unknown) => void;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
  readonly setInterval?: typeof setInterval;
  readonly clearInterval?: typeof clearInterval;
  readonly logger?: Logger;
}

/**
 * 第一版周期触发器。Schedule 本身应由 Workspace 持久化；本类只负责读取定义、
 * 计算到期时间并生成 WakeSignal，方便后续替换为数据库或外部时钟。
 */
export class ScheduleRunner {
  private readonly now: () => number;
  private readonly startInterval: typeof setInterval;
  private readonly stopInterval: typeof clearInterval;
  private timer: ReturnType<typeof setInterval> | undefined;
  private cycle: Promise<readonly WakeSignal[]> | undefined;
  private stopping = false;

  public constructor(private readonly options: ScheduleRunnerOptions) {
    this.now = options.now ?? Date.now;
    this.startInterval = options.setInterval ?? setInterval;
    this.stopInterval = options.clearInterval ?? clearInterval;
  }

  public upsert(schedule: Schedule): void {
    if (!Number.isInteger(schedule.intervalMs) || schedule.intervalMs < 1)
      throw new Error("Schedule intervalMs must be a positive integer");
    if (!Number.isFinite(schedule.nextRunAt))
      throw new Error("Schedule nextRunAt must be a finite timestamp");
    if (
      !this.options.repository.getParticipant(
        schedule.workspaceId,
        schedule.agentId,
      )
    )
      throw new Error(`Schedule agent not found: ${schedule.agentId}`);
    this.options.repository.saveSchedule(schedule);
  }

  public remove(scheduleId: string): boolean {
    const schedule = this.options.repository
      .listSchedules()
      .find((item) => item.id === scheduleId);
    if (!schedule) return false;
    this.options.repository.deleteSchedule(schedule.workspaceId, schedule.id);
    return true;
  }

  public list(): readonly Schedule[] {
    return this.options.repository.listSchedules();
  }

  /** 扫描到期 Schedule，并把每个到期定义转换成一次 WakeSignal。 */
  public tick(at = this.now()): readonly WakeSignal[] {
    if (this.stopping) return [];
    const signals: WakeSignal[] = [];
    for (const schedule of this.options.repository.listSchedules()) {
      if (
        schedule.enabled === false ||
        schedule.nextRunAt > at ||
        (schedule.nextAttemptAt !== undefined && schedule.nextAttemptAt > at)
      )
        continue;
      signals.push(
        this.options.scheduler.notifySchedule({
          scheduleId: schedule.id,
          workspaceId: schedule.workspaceId,
          agentId: schedule.agentId,
          scheduledFor: schedule.nextRunAt,
        }),
      );
    }
    return signals;
  }

  /** 扫描并把到期唤醒交给 Scheduler；单个派发失败不会阻塞其它 Schedule。 */
  public async tickAndDispatch(
    at = this.now(),
  ): Promise<readonly WakeSignal[]> {
    // 同一时间只允许一个派发 cycle，停止时可等待它完成，保证 SQLite 仍然有效。
    if (this.cycle) return this.cycle;
    this.cycle = this.dispatchCycle(at).finally(() => {
      this.cycle = undefined;
    });
    return this.cycle;
  }

  private async dispatchCycle(at: number): Promise<readonly WakeSignal[]> {
    const signals = this.tick(at);
    if (!this.options.dispatch) return signals;
    await Promise.all(
      signals.map(async (signal) => {
        try {
          const result = await this.options.dispatch?.(signal);
          this.advance(signal, at, result);
        } catch (error) {
          this.fail(signal, at, error);
          this.options.onError?.(error);
        }
      }),
    );
    return signals;
  }

  public start(): void {
    if (this.timer) return;
    this.stopping = false;
    const pollIntervalMs = this.options.pollIntervalMs ?? 1_000;
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1)
      throw new Error("Schedule pollIntervalMs must be a positive integer");
    this.timer = this.startInterval(() => {
      void this.tickAndDispatch().catch((error) =>
        this.options.onError?.(error),
      );
    }, pollIntervalMs);
  }

  public async stop(_signal?: AbortSignal): Promise<void> {
    // 只停止新扫描；当前派发由 Application 在取消 Runs 后统一 drain。
    this.stopping = true;
    if (this.timer) {
      this.stopInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Wait until an already-started dispatch cycle has finished. */
  public async drain(): Promise<void> {
    await this.cycle;
  }

  private advance(signal: WakeSignal, at: number, result: unknown): void {
    // 只有 occurrence 未被其他执行者推进时才更新，保证重试/重放幂等。
    if (signal.scheduledFor === undefined) return;
    const schedule = this.options.repository.getSchedule(
      signal.workspaceId,
      signal.sourceRef.id,
    );
    if (!schedule || schedule.enabled === false) return;
    if (schedule.nextRunAt !== signal.scheduledFor) return;
    let nextRunAt = schedule.nextRunAt;
    do nextRunAt += schedule.intervalMs;
    while (nextRunAt <= at);
    const runId = isRun(result) ? result.runId : undefined;
    this.options.repository.saveSchedule({
      ...schedule,
      nextRunAt,
      ...(runId ? { lastRunId: runId } : {}),
      lastRunAt: at,
      lastError: undefined,
      consecutiveFailures: 0,
      nextAttemptAt: undefined,
    });
  }

  private fail(signal: WakeSignal, at: number, error: unknown): void {
    // 失败不推进 occurrence，只把下一次尝试延后并持久化指数退避。
    if (signal.scheduledFor === undefined) return;
    const schedule = this.options.repository.getSchedule(
      signal.workspaceId,
      signal.sourceRef.id,
    );
    if (!schedule || schedule.nextRunAt !== signal.scheduledFor) return;
    const failures = (schedule.consecutiveFailures ?? 0) + 1;
    const delay = Math.min(60_000, 1_000 * 2 ** (failures - 1));
    const message = error instanceof Error ? error.message : String(error);
    this.options.repository.saveSchedule({
      ...schedule,
      lastRunAt: at,
      lastError: message,
      consecutiveFailures: failures,
      nextAttemptAt: at + delay,
    });
  }
}

function isRun(value: unknown): value is { readonly runId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { runId?: unknown }).runId === "string"
  );
}
