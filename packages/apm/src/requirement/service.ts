import { RequirementNotFoundError } from "./errors.js";
import { transitionRequirement } from "./lifecycle.js";
import type { RequirementQuery, RequirementRepository } from "./repository.js";
import type {
  Requirement,
  RequirementComment,
  RequirementEvidence,
} from "./requirement.js";

export interface CreateRequirementInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly ownerId?: string;
  readonly cardId?: string;
  readonly conversationId?: string;
  readonly externalRefs?: readonly Requirement["externalRefs"][number][];
  readonly now: string;
}

export interface WorkspaceReferencePort {
  hasCard(workspaceId: string, cardId: string): boolean;
  hasConversation(workspaceId: string, conversationId: string): boolean;
}

export class RequirementService {
  public constructor(
    private readonly repository: RequirementRepository,
    private readonly references?: WorkspaceReferencePort,
  ) {}

  public get(workspaceId: string, requirementId: string): Requirement {
    return this.require(workspaceId, requirementId);
  }

  public list(
    workspaceId: string,
    query?: RequirementQuery,
  ): readonly Requirement[] {
    return this.repository.list(workspaceId, query);
  }

  public create(input: CreateRequirementInput): Requirement {
    if (!input.cardId && !input.conversationId)
      throw new Error("Requirement must reference a Card or Conversation");
    if (
      input.cardId &&
      this.references &&
      !this.references.hasCard(input.workspaceId, input.cardId)
    )
      throw new Error(
        `Card ${input.cardId} is not in workspace ${input.workspaceId}`,
      );
    if (
      input.conversationId &&
      this.references &&
      !this.references.hasConversation(input.workspaceId, input.conversationId)
    )
      throw new Error(
        `Conversation ${input.conversationId} is not in workspace ${input.workspaceId}`,
      );
    const requirement: Requirement = {
      id: input.id,
      workspaceId: input.workspaceId,
      title: input.title,
      status: "needs_clarification",
      ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
      ...(input.cardId === undefined ? {} : { cardId: input.cardId }),
      ...(input.conversationId === undefined
        ? {}
        : { conversationId: input.conversationId }),
      externalRefs: input.externalRefs ?? [],
      version: 0,
      updatedAt: input.now,
      comments: [],
      evidence: [],
    };
    this.repository.save(requirement);
    return requirement;
  }

  public addEvidence(
    workspaceId: string,
    requirementId: string,
    evidence: RequirementEvidence,
    expectedVersion: number,
  ): Requirement {
    const current = this.require(workspaceId, requirementId);
    const next = {
      ...current,
      evidence: [...current.evidence, evidence],
      version: current.version + 1,
      updatedAt: evidence.createdAt,
    };
    this.repository.save(next, expectedVersion);
    return next;
  }

  public addComment(
    workspaceId: string,
    requirementId: string,
    comment: RequirementComment,
    expectedVersion: number,
  ): Requirement {
    const current = this.require(workspaceId, requirementId);
    const next = {
      ...current,
      comments: [...current.comments, comment],
      version: current.version + 1,
      updatedAt: comment.createdAt,
    };
    this.repository.save(next, expectedVersion);
    return next;
  }

  public confirm(
    workspaceId: string,
    requirementId: string,
    expectedVersion: number,
    now: string,
  ): Requirement {
    return this.transition(
      workspaceId,
      requirementId,
      expectedVersion,
      "confirmed",
      now,
    );
  }

  public start(
    workspaceId: string,
    requirementId: string,
    expectedVersion: number,
    now: string,
  ): Requirement {
    return this.transition(
      workspaceId,
      requirementId,
      expectedVersion,
      "in_progress",
      now,
    );
  }

  public requestReview(
    workspaceId: string,
    requirementId: string,
    expectedVersion: number,
    now: string,
  ): Requirement {
    return this.transition(
      workspaceId,
      requirementId,
      expectedVersion,
      "review_pending",
      now,
    );
  }

  public requestRework(
    workspaceId: string,
    requirementId: string,
    expectedVersion: number,
    now: string,
  ): Requirement {
    return this.transition(
      workspaceId,
      requirementId,
      expectedVersion,
      "rework",
      now,
    );
  }

  public approveReview(
    workspaceId: string,
    requirementId: string,
    expectedVersion: number,
    approvedBy: string,
    now: string,
    comment?: string,
  ): Requirement {
    const current = this.require(workspaceId, requirementId);
    const delivered = transitionRequirement(current, "delivered", now, {
      approvedBy,
      approvedAt: now,
      ...(comment === undefined ? {} : { comment }),
    });
    this.repository.save(delivered, expectedVersion);
    return delivered;
  }

  private transition(
    workspaceId: string,
    requirementId: string,
    expectedVersion: number,
    status: Parameters<typeof transitionRequirement>[1],
    now: string,
  ): Requirement {
    const current = this.require(workspaceId, requirementId);
    const next = transitionRequirement(current, status, now);
    this.repository.save(next, expectedVersion);
    return next;
  }

  private require(workspaceId: string, requirementId: string): Requirement {
    const requirement = this.repository.get(workspaceId, requirementId);
    if (!requirement) throw new RequirementNotFoundError(requirementId);
    return requirement;
  }
}
