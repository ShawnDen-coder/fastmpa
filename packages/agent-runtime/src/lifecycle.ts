import type { RunStatus } from "./types/run";

export class InvalidRunTransitionError extends Error {
  public readonly from: RunStatus;
  public readonly to: RunStatus;

  public constructor(from: RunStatus, to: RunStatus) {
    super(`Invalid AgentRun transition: ${from} -> ${to}`);
    this.name = "InvalidRunTransitionError";
    this.from = from;
    this.to = to;
  }
}

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ["running"],
  running: ["waiting", "blocked", "completed", "cancelled", "failed"],
  waiting: ["queued"],
  blocked: ["queued"],
  completed: [],
  cancelled: [],
  failed: [],
};

/** Returns whether a Run may move from one lifecycle state to another. */
export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return transitions[from].includes(to);
}

/** Applies one lifecycle transition or throws a structured error. */
export function transition(from: RunStatus, to: RunStatus): RunStatus {
  if (!canTransition(from, to)) {
    throw new InvalidRunTransitionError(from, to);
  }
  return to;
}
