import type { SqliteDatabase } from "@shawnden-coder/agent-runtime";
import type {
  SettingsSnapshot,
  SettingsUpdate,
  UserPreferences,
  WorkspaceSettings,
} from "../shared/contracts/settings.js";

const DEFAULT_PREFERENCES: UserPreferences = {
  notificationsEnabled: true,
  sendShortcut: "enter",
};
function defaults(workspaceId: string): WorkspaceSettings {
  return {
    workspaceId,
    defaultModel: "default",
    maxAgents: 3,
    writeApproval: "always",
    externalApproval: true,
    approvalTimeoutMinutes: 30,
    version: 1,
  };
}

export class SettingsVersionConflictError extends Error {
  public readonly code = "SETTINGS_VERSION_CONFLICT" as const;
  public constructor(
    public readonly workspaceId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(`Settings changed for workspace ${workspaceId}`);
  }
}

export class SqliteSettingsStore {
  public constructor(private readonly database: SqliteDatabase["client"]) {
    database.exec(
      `CREATE TABLE IF NOT EXISTS application_settings (scope TEXT NOT NULL, scope_id TEXT NOT NULL, payload_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (scope, scope_id));`,
    );
  }
  public get(workspaceId: string): SettingsSnapshot {
    return {
      preferences:
        this.read<UserPreferences>("global", "global") ?? DEFAULT_PREFERENCES,
      workspace:
        this.read<WorkspaceSettings>("workspace", workspaceId) ??
        defaults(workspaceId),
    };
  }
  public update(update: SettingsUpdate): SettingsSnapshot {
    const current = this.get(update.workspaceId);
    if (update.workspace) {
      if (update.workspace.version !== current.workspace.version)
        throw new SettingsVersionConflictError(
          update.workspaceId,
          update.workspace.version,
          current.workspace.version,
        );
      const next = {
        ...current.workspace,
        ...update.workspace,
        version: current.workspace.version + 1,
      };
      validate(next);
      this.write("workspace", update.workspaceId, next, next.version);
    }
    if (update.preferences)
      this.write(
        "global",
        "global",
        { ...current.preferences, ...update.preferences },
        1,
      );
    return this.get(update.workspaceId);
  }
  private read<T>(scope: string, scopeId: string): T | undefined {
    const row = this.database
      .prepare(
        "SELECT payload_json AS payloadJson FROM application_settings WHERE scope = ? AND scope_id = ?",
      )
      .get(scope, scopeId) as { payloadJson: string } | undefined;
    return row ? (JSON.parse(row.payloadJson) as T) : undefined;
  }
  private write(
    scope: string,
    scopeId: string,
    value: unknown,
    version: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO application_settings (scope, scope_id, payload_json, version, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scope, scope_id) DO UPDATE SET payload_json = excluded.payload_json, version = excluded.version, updated_at = excluded.updated_at`,
      )
      .run(
        scope,
        scopeId,
        JSON.stringify(value),
        version,
        new Date().toISOString(),
      );
  }
}

function validate(settings: WorkspaceSettings): void {
  if (
    !Number.isInteger(settings.maxAgents) ||
    settings.maxAgents < 1 ||
    settings.maxAgents > 5
  )
    throw new Error("maxAgents must be between 1 and 5");
  if (
    !Number.isInteger(settings.approvalTimeoutMinutes) ||
    settings.approvalTimeoutMinutes < 1 ||
    settings.approvalTimeoutMinutes > 1440
  )
    throw new Error("approvalTimeoutMinutes must be between 1 and 1440");
  if (
    settings.writeApproval !== "always" &&
    settings.writeApproval !== "external"
  )
    throw new Error("Invalid write approval mode");
}
