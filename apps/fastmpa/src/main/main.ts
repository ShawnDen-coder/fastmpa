import { join } from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import type { FastMpaApplication } from "../application.js";
import { bootstrap } from "../bootstrap.js";
import { desktopChannels } from "../shared/desktop-api.js";

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
      preload: join(import.meta.dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
  ipcMain.handle(desktopChannels.getSnapshot, (_event, query) =>
    application?.getSnapshot(query),
  );
  ipcMain.handle(desktopChannels.dispatch, (_event, command) =>
    application?.dispatch(command),
  );
  ipcMain.handle(desktopChannels.getRecentLogs, (_event, limit) =>
    application?.getRecentLogs(limit),
  );
  ipcMain.handle(desktopChannels.getInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  }));
  ipcMain.handle(desktopChannels.openExternal, (_event, url: string) => {
    if (!url.startsWith("https://"))
      throw new Error("Only HTTPS URLs are allowed");
    return shell.openExternal(url);
  });
  ipcMain.handle(
    desktopChannels.revealLogFile,
    () => application && shell.showItemInFolder(application.getLogPath()),
  );
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
