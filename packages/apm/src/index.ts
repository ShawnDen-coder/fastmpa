/** A platform-neutral requirement snapshot consumed by APM rules. */
export interface RequirementSnapshot {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly iterationId: string | null;
  readonly externalUrl?: string;
}

/** The business policy for the first Requirement vertical slice. */
export interface RequirementIterationPolicy {
  readonly projectId: string;
  readonly expectedIterationId: string;
}

export interface RequirementIterationViolation {
  readonly requirementId: string;
  readonly title: string;
  readonly reason: "missing" | "unexpected";
  readonly currentIterationId: string | null;
  readonly expectedIterationId: string;
  readonly externalUrl?: string;
}

/** Pure APM rule: no TAPD, HTTP, Tool or Runtime dependency. */
export function evaluateRequirementIteration(
  requirement: RequirementSnapshot,
  policy: RequirementIterationPolicy,
): RequirementIterationViolation | undefined {
  if (requirement.projectId !== policy.projectId) return undefined;
  if (requirement.iterationId === policy.expectedIterationId) return undefined;
  return {
    requirementId: requirement.id,
    title: requirement.title,
    reason: requirement.iterationId === null ? "missing" : "unexpected",
    currentIterationId: requirement.iterationId,
    expectedIterationId: policy.expectedIterationId,
    ...(requirement.externalUrl === undefined
      ? {}
      : { externalUrl: requirement.externalUrl }),
  };
}

export * from "./requirement/errors.js";
export * from "./requirement/lifecycle.js";
export * from "./requirement/memory-repository.js";
export * from "./requirement/repository.js";
export * from "./requirement/requirement.js";
export * from "./requirement/rules.js";
export * from "./requirement/service.js";
export * from "./requirement/sqlite-repository.js";
export * from "./tools/requirement.js";
