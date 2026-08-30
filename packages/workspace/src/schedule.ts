/** Workspace 中持久化的周期工作来源；它描述何时唤醒哪个 Agent，不描述如何执行。 */
export interface Schedule {
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly intervalMs: number;
  readonly nextRunAt: number;
  readonly instruction: string;
  readonly enabled?: boolean;
  readonly lastRunAt?: number;
  readonly lastRunId?: string;
  readonly lastError?: string;
  readonly consecutiveFailures?: number;
  readonly nextAttemptAt?: number;
  readonly createdAt: string;
}

export interface ScheduleOccurrence {
  readonly scheduleId: string;
  readonly scheduledFor: number;
  readonly workspaceId: string;
  readonly agentId: string;
}
