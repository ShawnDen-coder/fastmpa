import { join } from "node:path";
import { app, type IpcMainInvokeEvent, ipcMain, shell } from "electron";
import type { FastMpaApplication } from "../application/application.js";
import type { ApplicationLogEntry } from "../shared/contracts/application.js";
import type { ShellSnapshotQuery } from "../shared/contracts/snapshot.js";
import { desktopChannels } from "../shared/desktop-api.js";
import {
  type IpcResponse,
  invalidPayload,
  isApplicationCommand,
  isConversationQuery,
} from "../shared/ipc/index.js";
import {
  isAllowedExternalUrl,
  isAllowedNavigation,
} from "./navigation-policy.js";

export interface IpcHandlerDependencies {
  readonly getApplication: () => FastMpaApplication;
  readonly getLogPath: () => string;
}

/** Register the privileged Main-process bridge for the single trusted renderer. */
export function registerIpcHandlers({
  getApplication,
  getLogPath,
}: IpcHandlerDependencies): void {
  ipcMain.handle(desktopChannels.getShellSnapshot, (event, query: unknown) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    if (
      query !== undefined &&
      (typeof query !== "object" ||
        query === null ||
        Object.keys(query).some((key) => key !== "workspaceId") ||
        ("workspaceId" in query &&
          (typeof query.workspaceId !== "string" || query.workspaceId === "")))
    )
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid shell snapshot query"),
      });
    return respond(() =>
      getApplication().getShellSnapshot(
        query as ShellSnapshotQuery | undefined,
      ),
    );
  });
  ipcMain.handle(desktopChannels.getConversationSnapshot, (event, query) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    if (!isConversationQuery(query))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid conversation query"),
      });
    return respond(() => getApplication().getConversationSnapshot(query));
  });
  ipcMain.handle(
    desktopChannels.getDispatchSnapshot,
    (event, dispatchId: unknown) => {
      const rejected = rejectUntrustedSender(event);
      if (rejected) return rejected;
      if (typeof dispatchId !== "string" || dispatchId.length === 0)
        return Promise.resolve({
          ok: false,
          error: invalidPayload("Invalid dispatch ID"),
        });
      return respond(() => getApplication().getDispatchSnapshot(dispatchId));
    },
  );
  ipcMain.handle(desktopChannels.getRunSnapshot, (event, runId: unknown) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    if (typeof runId !== "string" || runId.length === 0)
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid Run ID"),
      });
    return respond(() => getApplication().getRunSnapshot(runId));
  });
  ipcMain.handle(desktopChannels.dispatch, (event, command) => {
    const rejected = rejectUntrustedSender(event);
    if (rejected) return rejected;
    if (!isApplicationCommand(command))
      return Promise.resolve({
        ok: false,
        error: invalidPayload("Invalid application command"),
      });
    return respond(() => getApplication().dispatch(command));
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
        getApplication().getRecentLogs(limit as number | undefined),
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
        logPath: getLogPath(),
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
      shell.showItemInFolder(getLogPath());
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

async function respond<T>(
  operation: () => Promise<T> | T,
): Promise<IpcResponse<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error: unknown) {
    const code =
      error instanceof Error &&
      "code" in error &&
      (error.code === "NOT_READY" || error.code === "APPLICATION_STOPPING")
        ? error.code
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

export type IpcLogEntry = ApplicationLogEntry;
