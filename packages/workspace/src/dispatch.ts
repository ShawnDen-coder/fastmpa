export type ConversationDispatchStatus =
  | "routing"
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "partial"
  | "failed";

export type DispatchAssignmentStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "cancelled"
  | "failed";

export interface DispatchAssignment {
  readonly agentId: string;
  readonly runId: string;
  readonly instruction: string;
  readonly reason: string;
  readonly status: DispatchAssignmentStatus;
}

export interface ConversationDispatch {
  readonly id: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly status: ConversationDispatchStatus;
  readonly assignments: readonly DispatchAssignment[];
  readonly createdAt: string;
  readonly completedAt?: string;
}
