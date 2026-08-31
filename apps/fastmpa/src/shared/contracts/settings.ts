export type WriteApprovalMode = "always" | "external";

export interface UserPreferences {
  readonly notificationsEnabled: boolean;
  readonly sendShortcut: "enter" | "ctrl-enter";
}

export interface WorkspaceSettings {
  readonly workspaceId: string;
  readonly defaultModel: string;
  readonly maxAgents: number;
  readonly writeApproval: WriteApprovalMode;
  readonly externalApproval: boolean;
  readonly approvalTimeoutMinutes: number;
  readonly version: number;
}

export interface SettingsSnapshot {
  readonly preferences: UserPreferences;
  readonly workspace: WorkspaceSettings;
}

export interface SettingsUpdate {
  readonly workspaceId: string;
  readonly preferences?: Partial<UserPreferences>;
  readonly workspace?: Partial<
    Omit<WorkspaceSettings, "workspaceId" | "version">
  > & {
    readonly version: number;
  };
}

export interface SettingsConflictErrorDto {
  readonly code: "SETTINGS_VERSION_CONFLICT";
  readonly workspaceId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;
}
