import { contextBridge, ipcRenderer } from "electron";
import type {
  ApplicationEvent,
  ApplicationLogEntry,
} from "../shared/contracts/application.js";
import type { SnapshotInvalidation } from "../shared/contracts/invalidation.js";
import type { FastMpaDesktopApi } from "../shared/desktop-api.js";
import { desktopChannels } from "../shared/desktop-api.js";
import type { ApplicationErrorDto, IpcResponse } from "../shared/ipc/index.js";

type IpcListener = Parameters<typeof ipcRenderer.on>[1];

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = (await ipcRenderer.invoke(
    channel,
    ...args,
  )) as IpcResponse<T>;
  if (response.ok) return response.value;
  const error = new Error(response.error.message) as Error & {
    readonly dto: ApplicationErrorDto;
  };
  Object.defineProperty(error, "dto", { value: response.error });
  throw error;
}

function subscribe<Arguments extends unknown[]>(
  channel: string,
  listener: (...args: Arguments) => void,
): () => void {
  const wrapped: IpcListener = (_event, ...args) =>
    listener(...(args as Arguments));
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: FastMpaDesktopApi = {
  application: {
    getShellSnapshot: () => invoke(desktopChannels.getShellSnapshot),
    getConversationSnapshot: (query) =>
      invoke(desktopChannels.getConversationSnapshot, query),
    getDispatchSnapshot: (dispatchId) =>
      invoke(desktopChannels.getDispatchSnapshot, dispatchId),
    getRunSnapshot: (runId) => invoke(desktopChannels.getRunSnapshot, runId),
    dispatch: (command) => invoke(desktopChannels.dispatch, command),
    getRecentLogs: (limit) => invoke(desktopChannels.getRecentLogs, limit),
    onEvents: (listener) =>
      subscribe<[readonly ApplicationEvent[]]>(desktopChannels.event, listener),
    onSnapshotInvalidated: (listener) =>
      subscribe<[SnapshotInvalidation]>(
        desktopChannels.snapshotInvalidated,
        listener,
      ),
    onLogs: (listener) =>
      subscribe<[readonly ApplicationLogEntry[]]>(
        desktopChannels.log,
        listener,
      ),
  },
  desktop: {
    getInfo: () => invoke(desktopChannels.getInfo),
    revealLogFile: () => invoke(desktopChannels.revealLogFile),
    revealDataDirectory: () => invoke(desktopChannels.revealDataDirectory),
    openExternal: (url) => invoke(desktopChannels.openExternal, url),
    onClosing: (listener) => subscribe(desktopChannels.closing, listener),
  },
};

contextBridge.exposeInMainWorld("fastMpa", api);
