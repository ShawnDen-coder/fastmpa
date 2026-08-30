import { contextBridge, ipcRenderer } from "electron";
import type { FastMpaDesktopApi } from "../shared/desktop-api.js";
import { desktopChannels } from "../shared/desktop-api.js";

type IpcListener = Parameters<typeof ipcRenderer.on>[1];

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
    getSnapshot: (query) =>
      ipcRenderer.invoke(desktopChannels.getSnapshot, query),
    dispatch: (command) =>
      ipcRenderer.invoke(desktopChannels.dispatch, command),
    getRecentLogs: (limit) =>
      ipcRenderer.invoke(desktopChannels.getRecentLogs, limit),
    onSnapshot: (listener) => subscribe(desktopChannels.snapshot, listener),
    onEvent: (listener) => subscribe(desktopChannels.event, listener),
    onLog: (listener) => subscribe(desktopChannels.log, listener),
  },
  desktop: {
    getInfo: () => ipcRenderer.invoke(desktopChannels.getInfo),
    revealLogFile: () => ipcRenderer.invoke(desktopChannels.revealLogFile),
    openExternal: (url) =>
      ipcRenderer.invoke(desktopChannels.openExternal, url),
    onClosing: (listener) => subscribe(desktopChannels.closing, listener),
  },
};

contextBridge.exposeInMainWorld("fastMpa", api);
