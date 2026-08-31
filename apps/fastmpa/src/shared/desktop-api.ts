import type {
  ApplicationCommand,
  ApplicationEvent,
  ApplicationLogEntry,
  CommandResult,
} from "./contracts/application.js";
import type { SnapshotInvalidation } from "./contracts/invalidation.js";
import type {
  ConversationQuery,
  ConversationSnapshot,
  RunSnapshot,
  ShellSnapshot,
} from "./contracts/snapshot.js";
import type { ConversationDispatchDto } from "./contracts/workspace.js";

export const desktopChannels = {
  getDispatchSnapshot: "application:get-dispatch-snapshot",
  getShellSnapshot: "application:get-shell-snapshot",
  getConversationSnapshot: "application:get-conversation-snapshot",
  getRunSnapshot: "application:get-run-snapshot",
  dispatch: "application:dispatch",
  getRecentLogs: "application:get-recent-logs",
  event: "application:event",
  snapshotInvalidated: "application:snapshot-invalidated",
  log: "application:log",
  closing: "desktop:closing",
  getInfo: "desktop:get-info",
  revealLogFile: "desktop:reveal-log-file",
  revealDataDirectory: "desktop:reveal-data-directory",
  openExternal: "desktop:open-external",
} as const;

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
    getShellSnapshot(): Promise<ShellSnapshot>;
    getConversationSnapshot(
      query: ConversationQuery,
    ): Promise<ConversationSnapshot>;
    getRunSnapshot(runId: string): Promise<RunSnapshot>;
    getDispatchSnapshot(dispatchId: string): Promise<ConversationDispatchDto>;
    dispatch(command: ApplicationCommand): Promise<CommandResult>;
    getRecentLogs(limit?: number): Promise<readonly ApplicationLogEntry[]>;
    onEvents(
      listener: (events: readonly ApplicationEvent[]) => void,
    ): () => void;
    onSnapshotInvalidated(
      listener: (scope: SnapshotInvalidation) => void,
    ): () => void;
    onLogs(
      listener: (entries: readonly ApplicationLogEntry[]) => void,
    ): () => void;
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
