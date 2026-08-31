import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, net, protocol, screen, shell } from "electron";
import type { FastMpaApplication } from "../application/application.js";
import { bootstrap } from "../application/bootstrap.js";
import type { ApplicationLogEntry } from "../shared/contracts/application.js";
import { desktopChannels } from "../shared/desktop-api.js";
import { EventBatcher } from "./event-batcher.js";
import { registerIpcHandlers } from "./ipc-handlers.js";
import {
  isAllowedExternalUrl,
  isAllowedNavigation,
} from "./navigation-policy.js";
import { resolveRendererPath } from "./renderer-path.js";
import {
  defaultWindowState,
  isWindowStateVisible,
  parseWindowState,
  type WindowState,
} from "./window-state.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

if (process.env.FASTMPA_E2E_USER_DATA)
  app.setPath("userData", process.env.FASTMPA_E2E_USER_DATA);
if (process.env.FASTMPA_E2E === "1")
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.FASTMPA_E2E_PORT ?? "9229",
  );

let application: FastMpaApplication | undefined;
let mainWindow: BrowserWindow | undefined;
let isQuitting = false;
const eventBatcher = new EventBatcher((events) => {
  broadcast(desktopChannels.event, events);
});
const logBatcher = new EventBatcher<ApplicationLogEntry>((entries) => {
  broadcast(desktopChannels.log, entries);
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
      preload: join(import.meta.dirname, "../preload/preload.cjs"),
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
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    }
  });

  if (!app.isPackaged)
    void window
      .loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173")
      .then(() => {
        if (process.env.FASTMPA_DEVTOOLS === "1")
          window.webContents.openDevTools({ mode: "detach" });
      });
  else void window.loadURL("app://fastmpa/index.html");
  return window;
}

function requireApplication(): FastMpaApplication {
  if (!application)
    throw Object.assign(new Error("Application is not ready"), {
      code: "NOT_READY",
    });
  return application;
}

function broadcast(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send(channel, value);
}

function registerAppProtocol(): void {
  const rendererRoot = resolve(import.meta.dirname, "../renderer");
  protocol.handle("app", (request) => {
    const filePath = resolveRendererPath(
      rendererRoot,
      new URL(request.url).pathname,
    );
    if (!filePath)
      return Promise.resolve(new Response("Not found", { status: 404 }));
    return net.fetch(pathToFileURL(filePath).toString()).then((response) => {
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
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
  const databasePath = join(app.getPath("userData"), "fastmpa.sqlite");
  application = await bootstrap({
    databasePath,
    logPath: join(app.getPath("userData"), "fastmpa.log"),
  });
  registerIpcHandlers({
    getApplication: requireApplication,
    getLogPath: () => requireApplication().getLogPath(),
  });
  application.subscribeEvents((event) => eventBatcher.push(event));
  application.subscribeSnapshotInvalidated((scope) =>
    broadcast(desktopChannels.snapshotInvalidated, scope),
  );
  application.subscribeLogs((entry) => logBatcher.push(entry));
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
  logBatcher.flush();
  broadcast(desktopChannels.closing, undefined);
  const currentApplication = application;
  application = undefined;
  if (currentApplication) await currentApplication.stop();
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
