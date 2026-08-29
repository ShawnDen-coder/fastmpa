export interface WorkClaim {
  readonly claimId: string;
  readonly workKey: string;
  readonly ownerId: string;
  readonly expiresAt: number;
}

export interface WorkClaimStore {
  acquire(input: {
    workKey: string;
    ownerId: string;
    now: number;
    leaseMs: number;
  }): WorkClaim | undefined;
  release(claimId: string, ownerId: string): boolean;
}

/** 第一版进程内 ClaimStore；接口独立出来，后续可替换为数据库原子操作。 */
export class InMemoryWorkClaimStore implements WorkClaimStore {
  private readonly claims = new Map<string, WorkClaim>();

  public constructor(
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  public acquire(input: {
    workKey: string;
    ownerId: string;
    now: number;
    leaseMs: number;
  }): WorkClaim | undefined {
    if (
      !Number.isFinite(input.now) ||
      !Number.isFinite(input.leaseMs) ||
      input.leaseMs <= 0
    )
      throw new Error(
        "Work claim time values must be finite and leaseMs must be positive",
      );
    const current = this.claims.get(input.workKey);
    if (current && current.expiresAt > input.now) return undefined;
    const claim: WorkClaim = {
      claimId: this.createId(),
      workKey: input.workKey,
      ownerId: input.ownerId,
      expiresAt: input.now + input.leaseMs,
    };
    this.claims.set(input.workKey, claim);
    return claim;
  }

  public release(claimId: string, ownerId: string): boolean {
    for (const [workKey, claim] of this.claims) {
      if (claim.claimId !== claimId || claim.ownerId !== ownerId) continue;
      this.claims.delete(workKey);
      return true;
    }
    return false;
  }
}
