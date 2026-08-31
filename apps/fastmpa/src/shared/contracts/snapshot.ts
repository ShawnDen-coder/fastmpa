import type { AgentRun } from "@shawnden-coder/agent-runtime";
import type {
  AttentionSnapshotDto,
  ConversationDispatchDto,
  ConversationDto,
  MessageDto,
  ParticipantDto,
  ScheduleDto,
  WorkspaceDto,
} from "./workspace.js";
export type RunPhase = "pending" | "active" | "waiting" | "terminal";

export interface PersistedRuntimeEvent {
  readonly runId: string;
  readonly sequence: number;
  readonly type: string;
  readonly occurredAt: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface ConversationSummary {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind?: ConversationDto["kind"];
  readonly title?: string;
  readonly participantIds: readonly string[];
  readonly lastMessagePreview?: string;
  readonly lastMessageAt?: string;
  readonly activeRunStatus?: string;
  readonly unread?: boolean;
}

export interface ShellSnapshot {
  readonly workspaces: readonly WorkspaceDto[];
  /** Workspace actually used to populate the scoped fields below. */
  readonly workspaceId: string;
  readonly attention?: AttentionSnapshotDto;
  readonly conversations: readonly ConversationSummary[];
  readonly participants: readonly ParticipantDto[];
  readonly schedules: readonly ScheduleDto[];
  readonly dispatches: readonly ConversationDispatchDto[];
  readonly models: readonly ModelDescriptor[];
}

export interface ShellSnapshotQuery {
  readonly workspaceId?: string;
}

export interface ModelDescriptor {
  readonly key: string;
  readonly label: string;
  readonly provider?: string;
  readonly configured: boolean;
}

export interface ConversationQuery {
  readonly workspaceId: string;
  readonly conversationId: string;
}

export interface ConversationSnapshot {
  readonly conversation?: ConversationDto;
  readonly messages: readonly MessageDto[];
  readonly runs: readonly (AgentRun & { readonly phase: RunPhase })[];
  readonly dispatches: readonly ConversationDispatchDto[];
  readonly events: readonly PersistedRuntimeEvent[];
}

export interface RunSnapshot {
  readonly run: (AgentRun & { readonly phase: RunPhase }) | undefined;
  readonly dispatch?: ConversationDispatchDto;
  readonly events: readonly PersistedRuntimeEvent[];
}
