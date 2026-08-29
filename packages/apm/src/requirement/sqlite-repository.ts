import Database from "better-sqlite3";
import {
  RequirementNotFoundError,
  RequirementVersionConflictError,
} from "./errors.js";
import type { RequirementQuery, RequirementRepository } from "./repository.js";
import type { Requirement } from "./requirement.js";

/** 独立于 Runtime 的 Requirement SQLite Repository；payload 保持领域模型原样序列化。 */
export class SqliteRequirementRepository implements RequirementRepository {
  private readonly database: Database.Database;

  public constructor(filePath: string) {
    this.database = new Database(filePath);
    this.database.pragma("foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS apm_requirements (
        workspace_id TEXT NOT NULL,
        requirement_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (workspace_id, requirement_id)
      );
    `);
  }

  public get(
    workspaceId: string,
    requirementId: string,
  ): Requirement | undefined {
    const row = this.database
      .prepare(
        `SELECT payload_json FROM apm_requirements
         WHERE workspace_id = ? AND requirement_id = ?`,
      )
      .get(workspaceId, requirementId) as
      | { payload_json?: unknown }
      | undefined;
    if (!row || typeof row.payload_json !== "string") return undefined;
    return JSON.parse(row.payload_json) as Requirement;
  }

  public save(requirement: Requirement, expectedVersion?: number): void {
    const current = this.database
      .prepare(
        `SELECT version FROM apm_requirements
         WHERE workspace_id = ? AND requirement_id = ?`,
      )
      .get(requirement.workspaceId, requirement.id) as
      | { version?: unknown }
      | undefined;
    if (!current) {
      if (expectedVersion !== undefined)
        throw new RequirementNotFoundError(requirement.id);
      if (requirement.version !== 0)
        throw new RequirementVersionConflictError(
          requirement.id,
          0,
          requirement.version,
        );
      this.database
        .prepare(
          `INSERT INTO apm_requirements
           (workspace_id, requirement_id, version, payload_json)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          requirement.workspaceId,
          requirement.id,
          requirement.version,
          JSON.stringify(requirement),
        );
      return;
    }
    const actualVersion = Number(current.version);
    if (expectedVersion !== actualVersion)
      throw new RequirementVersionConflictError(
        requirement.id,
        expectedVersion ?? actualVersion,
        actualVersion,
      );
    if (requirement.version !== actualVersion + 1)
      throw new RequirementVersionConflictError(
        requirement.id,
        actualVersion + 1,
        requirement.version,
      );
    const result = this.database
      .prepare(
        `UPDATE apm_requirements SET version = ?, payload_json = ?
         WHERE workspace_id = ? AND requirement_id = ? AND version = ?`,
      )
      .run(
        requirement.version,
        JSON.stringify(requirement),
        requirement.workspaceId,
        requirement.id,
        actualVersion,
      );
    if (result.changes !== 1)
      throw new RequirementVersionConflictError(
        requirement.id,
        actualVersion,
        actualVersion + 1,
      );
  }

  public list(
    workspaceId: string,
    query: RequirementQuery = {},
  ): readonly Requirement[] {
    const rows = this.database
      .prepare(
        `SELECT payload_json FROM apm_requirements
         WHERE workspace_id = ? ORDER BY requirement_id ASC`,
      )
      .all(workspaceId) as { payload_json?: unknown }[];
    const requirements = rows
      .flatMap((row) =>
        typeof row.payload_json === "string"
          ? [JSON.parse(row.payload_json) as Requirement]
          : [],
      )
      .filter(
        (requirement) =>
          (query.status === undefined || requirement.status === query.status) &&
          (query.ownerId === undefined ||
            requirement.ownerId === query.ownerId),
      );
    return query.limit === undefined
      ? requirements
      : requirements.slice(0, query.limit);
  }

  public close(): void {
    this.database.close();
  }
}
