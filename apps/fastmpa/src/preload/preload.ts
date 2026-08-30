import { contextBridge, ipcRenderer } from "electron";
import type { ApplicationEvent } from "../application.js";
import type { FastMpaDesktopApi } from "../shared/desktop-api.js";
import { desktopChannels } from "../shared/desktop-api.js";
import type { ApplicationErrorDto, IpcResponse } from "../shared/ipc.js";

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
    getSnapshot: (query) => invoke(desktopChannels.getSnapshot, query),
    dispatch: (command) => invoke(desktopChannels.dispatch, command),
    getRecentLogs: (limit) => invoke(desktopChannels.getRecentLogs, limit),
    onSnapshot: (listener) => subscribe(desktopChannels.snapshot, listener),
    onEvent: (listener) =>
      subscribe<[ApplicationEvent]>(desktopChannels.event, listener),
    onLog: (listener) => subscribe(desktopChannels.log, listener),
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
