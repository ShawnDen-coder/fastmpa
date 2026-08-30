import { join } from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import type { FastMpaApplication } from "../application.js";
import { bootstrap } from "../bootstrap.js";
import { desktopChannels } from "../shared/desktop-api.js";
import {
  type IpcResponse,
  invalidPayload,
  isApplicationCommand,
  isSnapshotQuery,
} from "../shared/ipc.js";

let application: FastMpaApplication | undefined;
let mainWindow: BrowserWindow | undefined;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "FastMPA",
    titleBarStyle: "hidden",
    titleBarOverlay: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://") && !url.startsWith("http://localhost:")) {
      event.preventDefault();
      if (url.startsWith("https://")) void shell.openExternal(url);
    }
  });

  if (!app.isPackaged)
    void window.loadURL(
      process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173",
    );
  else
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  return window;
}

function registerIpc(): void {
  ipcMain.handle(desktopChannels.getSnapshot, (_event, query) => {
    if (!isSnapshotQuery(query))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid snapshot query"),
      });
    return respond(() => requireApplication().getSnapshot(query));
  });
  ipcMain.handle(desktopChannels.dispatch, (_event, command) => {
    if (!isApplicationCommand(command))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid application command"),
      });
    return respond(() => requireApplication().dispatch(command));
  });
  ipcMain.handle(desktopChannels.getRecentLogs, (_event, limit: unknown) => {
    if (
      limit !== undefined &&
      (typeof limit !== "number" ||
        !Number.isInteger(limit) ||
        limit < 0 ||
        limit > 500)
    )
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid log limit"),
      });
    return respond(() =>
      Promise.resolve(
        requireApplication().getRecentLogs(limit as number | undefined),
      ),
    );
  });
  ipcMain.handle(desktopChannels.getInfo, () =>
    Promise.resolve({
      ok: true,
      value: {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
      },
    }),
  );
  ipcMain.handle(desktopChannels.openExternal, (_event, url: unknown) => {
    if (typeof url !== "string" || !url.startsWith("https://"))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Only HTTPS URLs are allowed"),
      });
    return respond(() => shell.openExternal(url));
  });
  ipcMain.handle(desktopChannels.revealLogFile, () =>
    respond(() => {
      shell.showItemInFolder(requireApplication().getLogPath());
    }),
  );
}

function requireApplication(): FastMpaApplication {
  if (!application)
    throw Object.assign(new Error("Application is not ready"), {
      code: "NOT_READY",
    });
  return application;
}

async function respond<T>(
  operation: () => Promise<T> | T,
): Promise<IpcResponse<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error: unknown) {
    const code =
      error instanceof Error && "code" in error && error.code === "NOT_READY"
        ? "NOT_READY"
        : "APPLICATION_ERROR";
    return {
      ok: false,
      error: {
        code,
        message:
          error instanceof Error ? error.message : "Application request failed",
      },
    };
  }
}

function broadcast(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send(channel, value);
}

async function start(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", () => mainWindow?.focus());
  await app.whenReady();
  application = await bootstrap({
    databasePath: join(app.getPath("userData"), "fastmpa.sqlite"),
    logPath: join(app.getPath("userData"), "fastmpa.log"),
  });
  registerIpc();
  application.subscribe((snapshot) =>
    broadcast(desktopChannels.snapshot, snapshot),
  );
  application.subscribeEvents((event) =>
    broadcast(desktopChannels.event, event),
  );
  application.subscribeLogs((entry) => broadcast(desktopChannels.log, entry));
  await application.start();
  mainWindow = createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}

void start().catch((error: unknown) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (!application) return;
  event.preventDefault();
  const currentApplication = application;
  application = undefined;
  void currentApplication.stop().finally(() => app.exit(0));
});
