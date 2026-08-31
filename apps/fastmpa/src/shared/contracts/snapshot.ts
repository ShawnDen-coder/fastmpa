import type { AgentRun } from "@shawnden-coder/agent-runtime";
import type {
  AttentionSnapshot,
  Conversation,
  ConversationDispatch,
  Message,
  Participant,
  Schedule,
  Workspace,
} from "workspace";
import type { RunPhase } from "./application.js";

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
  readonly kind?: Conversation["kind"];
  readonly title?: string;
  readonly participantIds: readonly string[];
  readonly lastMessagePreview?: string;
  readonly lastMessageAt?: string;
  readonly activeRunStatus?: string;
  readonly unread?: boolean;
}

export interface ShellSnapshot {
  readonly workspaces: readonly Workspace[];
  readonly selectedWorkspaceId?: string;
  readonly attention?: AttentionSnapshot;
  readonly conversations: readonly ConversationSummary[];
  readonly participants: readonly Participant[];
  readonly schedules: readonly Schedule[];
  readonly dispatches: readonly ConversationDispatch[];
}

export interface ConversationQuery {
  readonly workspaceId: string;
  readonly conversationId: string;
}

export interface ConversationSnapshot {
  readonly conversation?: Conversation;
  readonly messages: readonly Message[];
  readonly runs: readonly (AgentRun & { readonly phase: RunPhase })[];
  readonly dispatches: readonly ConversationDispatch[];
  readonly events: readonly PersistedRuntimeEvent[];
}

export interface RunSnapshot {
  readonly run: (AgentRun & { readonly phase: RunPhase }) | undefined;
  readonly dispatch?: ConversationDispatch;
  readonly events: readonly PersistedRuntimeEvent[];
}
