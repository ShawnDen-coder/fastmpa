import type {
  MessageDto,
  ParticipantDto,
} from "../../../shared/contracts/workspace.js";

export type WorkbenchPage =
  | "Conversations"
  | "Agents"
  | "Runs"
  | "Schedules"
  | "Logs"
  | "Settings";

export interface ConversationListItemViewModel {
  readonly id: string;
  readonly title: string;
  readonly kind: "direct" | "group";
  readonly participantCount: number;
  readonly preview?: string;
  readonly status?: string;
  readonly unread: boolean;
}

export interface MessageRowViewModel extends MessageDto {
  readonly sender: ParticipantDto;
  readonly isUser: boolean;
  readonly isStreaming?: boolean;
}

export interface RunSummaryViewModel {
  readonly runId: string;
  readonly agentName: string;
  readonly status: string;
  readonly toolCount: number;
  readonly duration?: string;
}

export interface ToolEventViewModel {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly operation?: string;
  readonly target?: string;
  readonly status: "running" | "completed" | "failed" | "approval_required";
}

export interface ApprovalRequestViewModel {
  readonly runId: string;
  readonly approvalId: string;
  readonly toolName: string;
  readonly operation?: string;
  readonly target?: string;
  readonly status:
    | "pending"
    | "submitting"
    | "approved"
    | "rejected"
    | "failed";
  readonly error?: string;
}

export type SettingsSectionId =
  | "preferences"
  | "workspace"
  | "execution"
  | "connections"
  | "security"
  | "about";

export interface SettingsDraft {
  readonly defaultModel: string;
  readonly maxAgents: number;
  readonly writeApproval: "always" | "external";
  readonly externalApproval: boolean;
  readonly approvalTimeoutMinutes: number;
}
