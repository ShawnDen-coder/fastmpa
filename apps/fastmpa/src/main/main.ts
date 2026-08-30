import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
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
import { importLegacyDatabase } from "./legacy-database.js";
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

function registerIpc(): void {
  ipcMain.handle(desktopChannels.getSnapshot, (event, query) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    if (!isSnapshotQuery(query))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid snapshot query"),
      });
    return respond(() => requireApplication().getSnapshot(query));
  });
  ipcMain.handle(desktopChannels.dispatch, (event, command) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    if (!isApplicationCommand(command))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid application command"),
      });
    return respond(() => requireApplication().dispatch(command));
  });
  ipcMain.handle(desktopChannels.getRecentLogs, (event, limit: unknown) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
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
  ipcMain.handle(desktopChannels.getInfo, (event) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    return Promise.resolve({
      ok: true,
      value: {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        model: process.env.OPENROUTER_MODEL ?? "Default OpenRouter model",
        databasePath: join(app.getPath("userData"), "fastmpa.sqlite"),
        logPath: join(app.getPath("userData"), "fastmpa.log"),
        dataDirectory: app.getPath("userData"),
        logLevel: process.env.FASTMPA_LOG_LEVEL ?? "info",
      },
    });
  });
  ipcMain.handle(desktopChannels.openExternal, (event, url: unknown) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    if (typeof url !== "string" || !isAllowedExternalUrl(url))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Only HTTPS URLs are allowed"),
      });
    return respond(() => shell.openExternal(url));
  });
  ipcMain.handle(desktopChannels.revealLogFile, (event) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    return respond(() => {
      shell.showItemInFolder(requireApplication().getLogPath());
    });
  });
  ipcMain.handle(desktopChannels.revealDataDirectory, (event) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    return respond(async () => {
      const error = await shell.openPath(app.getPath("userData"));
      if (error) throw new Error(error);
    });
  });
}

function rejectUntrustedSender(
  event: IpcMainInvokeEvent,
): IpcResponse<never> | undefined {
  return isAllowedNavigation(event.senderFrame?.url ?? "")
    ? undefined
    : {
        ok: false,
        error: invalidPayload("Untrusted renderer sender"),
      };
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
  protocol.handle("app", (request) => {
    const filePath = resolveRendererPath(
      rendererRoot,
      new URL(request.url).pathname,
    );
    if (!filePath)
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
  const databasePath = join(app.getPath("userData"), "fastmpa.sqlite");
  if (!(await prepareLegacyDatabase(databasePath))) {
    app.quit();
    return;
  }
  application = await bootstrap({
    databasePath,
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

async function prepareLegacyDatabase(databasePath: string): Promise<boolean> {
  const legacyPath = join(process.cwd(), "fastmpa.sqlite");
  if (
    legacyPath === databasePath ||
    !existsSync(legacyPath) ||
    existsSync(databasePath)
  )
    return true;
  const choice = await dialog.showMessageBox({
    type: "question",
    title: "FastMPA data found",
    message: "An existing FastMPA database was found in the old workspace.",
    detail:
      "Import it into this Desktop installation, start fresh, or cancel startup.",
    buttons: ["Import existing data", "Start fresh", "Cancel"],
    defaultId: 0,
    cancelId: 2,
  });
  if (choice.response === 2) return false;
  if (choice.response === 1) return true;
  importLegacyDatabase(legacyPath, databasePath);
  return true;
}

async function shutdown(): Promise<void> {
  if (isQuitting) return;
  isQuitting = true;
  eventBatcher.flush();
  broadcast(desktopChannels.closing, undefined);
  const currentApplication = application;
  application = undefined;
  if (currentApplication) {
    const drained = await Promise.race([
      currentApplication.stop().then(() => true),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), 15_000),
      ),
    ]);
    if (!drained) {
      const snapshot = await currentApplication.getSnapshot();
      const activeRuns = snapshot.runs.filter((run) =>
        ["queued", "running", "retrying", "waiting"].includes(run.status),
      );
      await Promise.race([
        Promise.all(
          activeRuns.map((run) =>
            currentApplication
              .dispatch({ type: "cancel", runId: run.runId })
              .catch(() => undefined),
          ),
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
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
