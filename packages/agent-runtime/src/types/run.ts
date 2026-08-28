/** Runtime-level state. This is intentionally separate from agent-core's TurnStatus. */
export type RunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled"
  | "failed";

export interface AgentRun {
  readonly runId: string;
  readonly status: RunStatus;
  readonly attempt: number;
  readonly version: number;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}
