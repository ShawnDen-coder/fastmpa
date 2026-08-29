export class RequirementNotFoundError extends Error {
  public constructor(public readonly requirementId: string) {
    super(`Requirement not found: ${requirementId}`);
    this.name = "RequirementNotFoundError";
  }
}

export class RequirementVersionConflictError extends Error {
  public constructor(
    public readonly requirementId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `Requirement ${requirementId} version conflict: expected ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = "RequirementVersionConflictError";
  }
}

export class RequirementRuleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RequirementRuleError";
  }
}
