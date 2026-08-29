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
    this.options.repository.saveSchedule(schedule);
  }

  public remove(scheduleId: string): boolean {
    const schedule = this.options.repository
      .listSchedules()
      .find((item) => item.id === scheduleId);
    if (!schedule) return false;
    this.options.repository.saveSchedule({ ...schedule, enabled: false });
    return true;
  }

  public list(): readonly Schedule[] {
    return this.options.repository.listSchedules();
  }

  /** 扫描到期 Schedule，并把每个到期定义转换成一次 WakeSignal。 */
  public tick(at = this.now()): readonly WakeSignal[] {
    const signals: WakeSignal[] = [];
    for (const schedule of this.options.repository.listSchedules()) {
      if (schedule.enabled === false || schedule.nextRunAt > at) continue;
      signals.push(
        this.options.scheduler.notifySchedule({
          scheduleId: schedule.id,
          workspaceId: schedule.workspaceId,
          agentId: schedule.agentId,
        }),
      );
      let nextRunAt = schedule.nextRunAt;
      do nextRunAt += schedule.intervalMs;
      while (nextRunAt <= at);
      this.options.repository.saveSchedule({ ...schedule, nextRunAt });
    }
    return signals;
  }

  /** 扫描并把到期唤醒交给 Scheduler；单个派发失败不会阻塞其它 Schedule。 */
  public async tickAndDispatch(
    at = this.now(),
  ): Promise<readonly WakeSignal[]> {
    const signals = this.tick(at);
    if (!this.options.dispatch) return signals;
    await Promise.all(
      signals.map(async (signal) => {
        try {
          await this.options.dispatch?.(signal);
        } catch (error) {
          this.options.onError?.(error);
        }
      }),
    );
    return signals;
  }

  public start(): void {
    if (this.timer) return;
    const pollIntervalMs = this.options.pollIntervalMs ?? 1_000;
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1)
      throw new Error("Schedule pollIntervalMs must be a positive integer");
    this.timer = this.startInterval(() => {
      void this.tickAndDispatch().catch((error) =>
        this.options.onError?.(error),
      );
    }, pollIntervalMs);
  }

  public stop(): void {
    if (!this.timer) return;
    this.stopInterval(this.timer);
    this.timer = undefined;
  }
}
