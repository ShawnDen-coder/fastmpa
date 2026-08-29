import type { Requirement } from "./requirement.js";

export interface RequirementQuery {
  readonly status?: Requirement["status"];
  readonly ownerId?: string;
  readonly limit?: number;
}

export interface RequirementRepository {
  get(workspaceId: string, requirementId: string): Requirement | undefined;
  list(workspaceId: string, query?: RequirementQuery): readonly Requirement[];
  save(requirement: Requirement, expectedVersion?: number): void;
}
