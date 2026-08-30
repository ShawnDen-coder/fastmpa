import type { ApplicationCommand } from "../application/application.js";
import type { SnapshotQuery } from "./desktop-api.js";

export interface ApplicationErrorDto {
  readonly code:
    | "INVALID_PAYLOAD"
    | "APPLICATION_ERROR"
    | "NOT_READY"
    | "INTERNAL_ERROR";
  readonly message: string;
}

export type IpcResponse<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApplicationErrorDto };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" && value[key] !== "";
}

export function isSnapshotQuery(value: unknown): value is SnapshotQuery {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (
    Object.keys(value).some(
      (key) => key !== "workspaceId" && key !== "conversationId",
    )
  )
    return false;
  return (
    (value.workspaceId === undefined ||
      typeof value.workspaceId === "string") &&
    (value.conversationId === undefined ||
      typeof value.conversationId === "string")
  );
}

export function isApplicationCommand(
  value: unknown,
): value is ApplicationCommand {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "workspace.create":
      return (
        hasString(value, "name") &&
        (value.workspaceId === undefined ||
          typeof value.workspaceId === "string")
      );
    case "workspace.rename":
      return hasString(value, "workspaceId") && hasString(value, "name");
    case "conversation.create":
      return (
        hasString(value, "workspaceId") &&
        (value.title === undefined || typeof value.title === "string") &&
        (value.conversationId === undefined ||
          typeof value.conversationId === "string") &&
        (value.agentId === undefined || typeof value.agentId === "string")
      );
    case "submit":
      return (
        hasString(value, "workspaceId") &&
        hasString(value, "conversationId") &&
        hasString(value, "body") &&
        (value.agentId === undefined || typeof value.agentId === "string")
      );
    case "cancel":
    case "retry":
      return hasString(value, "runId");
    case "approve":
    case "reject":
      return hasString(value, "runId") && hasString(value, "approvalId");
    case "schedule.create":
      return (
        hasString(value, "workspaceId") &&
        hasString(value, "agentId") &&
        hasString(value, "instruction") &&
        typeof value.intervalMs === "number" &&
        Number.isFinite(value.intervalMs) &&
        value.intervalMs > 0 &&
        (value.scheduleId === undefined || typeof value.scheduleId === "string")
      );
    case "schedule.pause":
    case "schedule.resume":
    case "schedule.delete":
      return hasString(value, "workspaceId") && hasString(value, "scheduleId");
    default:
      return false;
  }
}

export function invalidPayload(message: string): ApplicationErrorDto {
  return { code: "INVALID_PAYLOAD", message };
}
