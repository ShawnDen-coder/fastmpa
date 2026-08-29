export type RequirementStatus =
  | "needs_clarification"
  | "confirmed"
  | "in_progress"
  | "review_pending"
  | "rework"
  | "delivered";

export interface ExternalRef {
  readonly system: string;
  readonly type: string;
  readonly id: string;
  readonly url?: string;
}

export interface RequirementEvidence {
  readonly id: string;
  readonly description: string;
  readonly ref?: ExternalRef;
  readonly createdAt: string;
}

export interface RequirementComment {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface RequirementReview {
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly comment?: string;
}

export interface Requirement {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly status: RequirementStatus;
  readonly ownerId?: string;
  readonly cardId?: string;
  readonly conversationId?: string;
  readonly externalRefs: readonly ExternalRef[];
  readonly version: number;
  readonly updatedAt: string;
  readonly comments: readonly RequirementComment[];
  readonly evidence: readonly RequirementEvidence[];
  readonly review?: RequirementReview;
}
