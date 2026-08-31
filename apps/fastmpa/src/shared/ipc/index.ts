import type { ApplicationCommand } from "../contracts/application.js";

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

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isAgentInput(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    hasString(value, "name") &&
    hasString(value, "modelKey") &&
    hasString(value, "persona") &&
    hasString(value, "role") &&
    isStringArray(value.capabilities) &&
    isStringArray(value.toolNames) &&
    (value.id === undefined || typeof value.id === "string")
  );
}

export function isConversationQuery(
  value: unknown,
): value is { workspaceId: string; conversationId: string } {
  return (
    isRecord(value) &&
    hasString(value, "workspaceId") &&
    hasString(value, "conversationId") &&
    Object.keys(value).every(
      (key) => key === "workspaceId" || key === "conversationId",
    )
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
    case "agent.create":
      return hasString(value, "workspaceId") && isAgentInput(value.input);
    case "agent.update":
      return (
        hasString(value, "workspaceId") &&
        hasString(value, "agentId") &&
        isRecord(value.patch) &&
        (value.patch.name === undefined ||
          typeof value.patch.name === "string") &&
        (value.patch.modelKey === undefined ||
          typeof value.patch.modelKey === "string") &&
        (value.patch.persona === undefined ||
          typeof value.patch.persona === "string") &&
        (value.patch.role === undefined ||
          typeof value.patch.role === "string") &&
        (value.patch.capabilities === undefined ||
          isStringArray(value.patch.capabilities)) &&
        (value.patch.toolNames === undefined ||
          isStringArray(value.patch.toolNames))
      );
    case "agent.activate":
    case "agent.archive":
      return hasString(value, "workspaceId") && hasString(value, "agentId");
    case "conversation.direct.open":
      return hasString(value, "workspaceId") && hasString(value, "agentId");
    case "conversation.group.create":
      return (
        hasString(value, "workspaceId") &&
        hasString(value, "title") &&
        isStringArray(value.agentIds) &&
        value.agentIds.length > 0 &&
        (value.routing === undefined || isRecord(value.routing))
      );
    case "conversation.group.rename":
      return (
        hasString(value, "workspaceId") &&
        hasString(value, "conversationId") &&
        hasString(value, "title")
      );
    case "conversation.member.add":
      return (
        hasString(value, "workspaceId") &&
        hasString(value, "conversationId") &&
        isStringArray(value.agentIds) &&
        value.agentIds.length > 0
      );
    case "conversation.member.remove":
      return (
        hasString(value, "workspaceId") &&
        hasString(value, "conversationId") &&
        hasString(value, "agentId")
      );
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
