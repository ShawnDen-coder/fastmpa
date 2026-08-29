import { RequirementRuleError } from "./errors.js";
import type {
  Requirement,
  RequirementReview,
  RequirementStatus,
} from "./requirement.js";

const transitions: Readonly<
  Record<RequirementStatus, readonly RequirementStatus[]>
> = {
  needs_clarification: ["confirmed"],
  confirmed: ["in_progress", "needs_clarification"],
  in_progress: ["review_pending", "needs_clarification"],
  review_pending: ["rework", "delivered"],
  rework: ["in_progress", "needs_clarification"],
  delivered: [],
};

export function transitionRequirement(
  requirement: Requirement,
  status: RequirementStatus,
  updatedAt: string,
  review?: RequirementReview,
): Requirement {
  if (!transitions[requirement.status].includes(status))
    throw new RequirementRuleError(
      `Invalid Requirement transition: ${requirement.status} -> ${status}`,
    );
  if (status === "in_progress" && !requirement.ownerId)
    throw new RequirementRuleError(
      "Requirement needs an owner before entering in_progress",
    );
  if (status === "review_pending" && requirement.evidence.length === 0)
    throw new RequirementRuleError(
      "Requirement needs evidence before entering review_pending",
    );
  if (
    status === "delivered" &&
    !review?.approvedBy &&
    !requirement.review?.approvedBy
  )
    throw new RequirementRuleError(
      "Requirement needs an approved review before entering delivered",
    );
  return {
    ...requirement,
    status,
    updatedAt,
    version: requirement.version + 1,
    ...(review === undefined ? {} : { review }),
  };
}

export function canTransition(
  from: RequirementStatus,
  to: RequirementStatus,
): boolean {
  return transitions[from].includes(to);
}
