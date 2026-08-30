import { openSqliteDatabase, type SqliteStoreConfig } from "../index.js";
import type { WorkClaim, WorkClaimStore } from "./claim.js";

type SqliteClient = Awaited<ReturnType<typeof openSqliteDatabase>>["client"];

/** SQLite 版 WorkClaimStore；抢占由单条 UPSERT 原子完成，可供多个进程共享。 */
export class SqliteWorkClaimStore implements WorkClaimStore {
  private constructor(private readonly client: SqliteClient) {
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS work_claims (
        work_key TEXT PRIMARY KEY NOT NULL,
        claim_id TEXT NOT NULL UNIQUE,
        owner_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }

  public static async open(
    config: SqliteStoreConfig,
  ): Promise<SqliteWorkClaimStore> {
    const database = await openSqliteDatabase(config);
    return new SqliteWorkClaimStore(database.client);
  }

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
    const claim: WorkClaim = {
      claimId: crypto.randomUUID(),
      workKey: input.workKey,
      ownerId: input.ownerId,
      expiresAt: input.now + input.leaseMs,
    };
    const result = this.client
      .prepare(`
        INSERT INTO work_claims (work_key, claim_id, owner_id, expires_at)
        VALUES (@workKey, @claimId, @ownerId, @expiresAt)
        ON CONFLICT(work_key) DO UPDATE SET
          claim_id = excluded.claim_id,
          owner_id = excluded.owner_id,
          expires_at = excluded.expires_at
        WHERE work_claims.expires_at <= @now
      `)
      .run({ ...claim, now: input.now });
    return result.changes === 1 ? claim : undefined;
  }

  public release(claimId: string, ownerId: string): boolean {
    const result = this.client
      .prepare("DELETE FROM work_claims WHERE claim_id = ? AND owner_id = ?")
      .run(claimId, ownerId);
    return result.changes === 1;
  }

  public close(): void {
    this.client.close();
  }
}
