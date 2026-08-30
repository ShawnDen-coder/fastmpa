import type {
  ApplicationCommand,
  ApplicationEvent,
  ApplicationLogEntry,
  ApplicationSnapshot,
  CommandResult,
} from "../application.js";

export const desktopChannels = {
  getSnapshot: "application:get-snapshot",
  dispatch: "application:dispatch",
  getRecentLogs: "application:get-recent-logs",
  snapshot: "application:snapshot",
  event: "application:event",
  log: "application:log",
  closing: "desktop:closing",
  getInfo: "desktop:get-info",
  revealLogFile: "desktop:reveal-log-file",
  revealDataDirectory: "desktop:reveal-data-directory",
  openExternal: "desktop:open-external",
} as const;

export interface SnapshotQuery {
  readonly workspaceId?: string;
  readonly conversationId?: string;
}

export interface DesktopInfo {
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly model: string;
  readonly databasePath: string;
  readonly logPath: string;
  readonly dataDirectory: string;
  readonly logLevel: string;
}

export type FastMpaDesktopApi = {
  readonly application: {
    getSnapshot(query?: SnapshotQuery): Promise<ApplicationSnapshot>;
    dispatch(command: ApplicationCommand): Promise<CommandResult>;
    getRecentLogs(limit?: number): Promise<readonly ApplicationLogEntry[]>;
    onSnapshot(listener: (snapshot: ApplicationSnapshot) => void): () => void;
    onEvent(listener: (event: ApplicationEvent) => void): () => void;
    onLog(listener: (entry: ApplicationLogEntry) => void): () => void;
  };
  readonly desktop: {
    getInfo(): Promise<DesktopInfo>;
    revealLogFile(): Promise<void>;
    revealDataDirectory(): Promise<void>;
    openExternal(url: string): Promise<void>;
    onClosing(listener: () => void): () => void;
  };
};

declare global {
  interface Window {
    readonly fastMpa: FastMpaDesktopApi;
  }
}
