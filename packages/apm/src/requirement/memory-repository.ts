import {
  RequirementNotFoundError,
  RequirementVersionConflictError,
} from "./errors.js";
import type { RequirementQuery, RequirementRepository } from "./repository.js";
import type { Requirement } from "./requirement.js";

const key = (workspaceId: string, requirementId: string) =>
  `${workspaceId}:${requirementId}`;

export class MemoryRequirementRepository implements RequirementRepository {
  private readonly requirements = new Map<string, Requirement>();

  public get(
    workspaceId: string,
    requirementId: string,
  ): Requirement | undefined {
    const requirement = this.requirements.get(key(workspaceId, requirementId));
    return requirement === undefined ? undefined : structuredClone(requirement);
  }

  public save(requirement: Requirement, expectedVersion?: number): void {
    const storageKey = key(requirement.workspaceId, requirement.id);
    const current = this.requirements.get(storageKey);
    if (current === undefined) {
      if (expectedVersion !== undefined)
        throw new RequirementNotFoundError(requirement.id);
      if (requirement.version !== 0)
        throw new RequirementVersionConflictError(
          requirement.id,
          0,
          requirement.version,
        );
    } else {
      if (expectedVersion !== current.version)
        throw new RequirementVersionConflictError(
          requirement.id,
          expectedVersion ?? current.version,
          current.version,
        );
      if (requirement.version !== current.version + 1)
        throw new RequirementVersionConflictError(
          requirement.id,
          current.version + 1,
          requirement.version,
        );
    }
    this.requirements.set(storageKey, structuredClone(requirement));
  }

  public list(
    workspaceId: string,
    query: RequirementQuery = {},
  ): readonly Requirement[] {
    const requirements = [...this.requirements.values()]
      .filter(
        (requirement) =>
          requirement.workspaceId === workspaceId &&
          (query.status === undefined || requirement.status === query.status) &&
          (query.ownerId === undefined ||
            requirement.ownerId === query.ownerId),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    return structuredClone(
      query.limit === undefined
        ? requirements
        : requirements.slice(0, query.limit),
    );
  }
}
