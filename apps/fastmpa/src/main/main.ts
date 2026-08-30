import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  screen,
  shell,
} from "electron";
import type { FastMpaApplication } from "../application.js";
import { bootstrap } from "../bootstrap.js";
import { desktopChannels } from "../shared/desktop-api.js";
import {
  type IpcResponse,
  invalidPayload,
  isApplicationCommand,
  isSnapshotQuery,
} from "../shared/ipc.js";
import { EventBatcher } from "./event-batcher.js";
import {
  defaultWindowState,
  isWindowStateVisible,
  parseWindowState,
  type WindowState,
} from "./window-state.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "fastmpa",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let application: FastMpaApplication | undefined;
let mainWindow: BrowserWindow | undefined;
let isQuitting = false;
const eventBatcher = new EventBatcher((events) => {
  for (const event of events) broadcast(desktopChannels.event, event);
});

function windowStatePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function readWindowState(): WindowState {
  try {
    return parseWindowState(readFileSync(windowStatePath(), "utf8"));
  } catch {
    return defaultWindowState;
  }
}

function saveWindowState(window: BrowserWindow): void {
  const bounds = window.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized(),
  };
  writeFileSync(windowStatePath(), JSON.stringify(state), "utf8");
}

function createWindow(): BrowserWindow {
  const state = readWindowState();
  const visible = isWindowStateVisible(
    state,
    screen.getAllDisplays().map(({ workArea }) => workArea),
  );
  const window = new BrowserWindow({
    x: visible ? state.x : undefined,
    y: visible ? state.y : undefined,
    width: state.width,
    height: state.height,
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

  if (state.isMaximized) window.maximize();
  window.on("resize", () => saveWindowState(window));
  window.on("move", () => saveWindowState(window));
  window.on("maximize", () => saveWindowState(window));
  window.on("unmaximize", () => saveWindowState(window));
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void shutdown();
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
  else void window.loadURL("fastmpa://app/index.html");
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

function registerAppProtocol(): void {
  const rendererRoot = resolve(import.meta.dirname, "../renderer");
  protocol.handle("fastmpa", (request) => {
    const requestedPath =
      decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "") ||
      "index.html";
    const filePath = resolve(rendererRoot, requestedPath);
    if (
      filePath !== rendererRoot &&
      !filePath.startsWith(`${rendererRoot}${sep}`)
    )
      return Promise.resolve(new Response("Not found", { status: 404 }));
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

async function start(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", () => mainWindow?.focus());
  await app.whenReady();
  if (app.isPackaged) registerAppProtocol();
  application = await bootstrap({
    databasePath: join(app.getPath("userData"), "fastmpa.sqlite"),
    logPath: join(app.getPath("userData"), "fastmpa.log"),
  });
  registerIpc();
  application.subscribe((snapshot) =>
    broadcast(desktopChannels.snapshot, snapshot),
  );
  application.subscribeEvents((event) => eventBatcher.push(event));
  application.subscribeLogs((entry) => broadcast(desktopChannels.log, entry));
  await application.start();
  mainWindow = createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}

async function shutdown(): Promise<void> {
  if (isQuitting) return;
  isQuitting = true;
  eventBatcher.flush();
  broadcast(desktopChannels.closing, undefined);
  const currentApplication = application;
  application = undefined;
  if (currentApplication) {
    await Promise.race([
      currentApplication.stop(),
      new Promise<void>((resolve) => setTimeout(resolve, 15_000)),
    ]);
  }
  app.exit(0);
}

void start().catch((error: unknown) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (isQuitting || !application) return;
  event.preventDefault();
  void shutdown();
});
