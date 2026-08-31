import type { AgentRun, RuntimeLiveEvent } from "@shawnden-coder/agent-runtime";
import type {
  AgentInput,
  AgentPatch,
  AttentionSnapshot,
  ConversationDispatch,
  GroupRoutingPolicy,
  Message,
  Participant,
  Schedule,
  Workspace,
} from "workspace";
import type { ApplicationLogEntry } from "./logging.js";

export type ApplicationCommand =
  | { type: "workspace.create"; name: string; workspaceId?: string }
  | { type: "workspace.rename"; workspaceId: string; name: string }
  | { type: "agent.create"; workspaceId: string; input: AgentInput }
  | {
      type: "agent.update";
      workspaceId: string;
      agentId: string;
      patch: AgentPatch;
    }
  | { type: "agent.activate"; workspaceId: string; agentId: string }
  | { type: "agent.archive"; workspaceId: string; agentId: string }
  | { type: "conversation.direct.open"; workspaceId: string; agentId: string }
  | {
      type: "conversation.group.create";
      workspaceId: string;
      title: string;
      agentIds: readonly string[];
      routing?: Partial<GroupRoutingPolicy>;
    }
  | {
      type: "conversation.group.rename";
      workspaceId: string;
      conversationId: string;
      title: string;
    }
  | {
      type: "conversation.member.add";
      workspaceId: string;
      conversationId: string;
      agentIds: readonly string[];
    }
  | {
      type: "conversation.member.remove";
      workspaceId: string;
      conversationId: string;
      agentId: string;
    }
  | {
      type: "conversation.create";
      workspaceId: string;
      title?: string;
      conversationId?: string;
      agentId?: string;
    }
  | {
      type: "submit";
      workspaceId: string;
      conversationId: string;
      body: string;
      agentId?: string;
    }
  | { type: "cancel"; runId: string }
  | { type: "retry"; runId: string }
  | { type: "approve"; runId: string; approvalId: string }
  | { type: "reject"; runId: string; approvalId: string }
  | {
      type: "schedule.create";
      workspaceId: string;
      agentId: string;
      instruction: string;
      intervalMs: number;
      scheduleId?: string;
    }
  | {
      type: "schedule.pause" | "schedule.resume" | "schedule.delete";
      workspaceId: string;
      scheduleId: string;
    };

export type RunPhase = "pending" | "active" | "waiting" | "terminal";

export interface ApplicationSnapshot {
  readonly workspaces: readonly Workspace[];
  readonly selectedWorkspaceId?: string;
  readonly selectedConversationId?: string;
  readonly attention?: AttentionSnapshot;
  readonly conversations: readonly {
    id: string;
    workspaceId: string;
    kind?: "direct" | "group";
    title?: string;
    participantIds: readonly string[];
    lastMessagePreview?: string;
    lastMessageAt?: string;
    activeRunStatus?: string;
    unread?: boolean;
  }[];
  readonly participants: readonly Participant[];
  readonly messages: readonly Message[];
  readonly runs: readonly (AgentRun & { readonly phase: RunPhase })[];
  readonly schedules: readonly Schedule[];
  readonly dispatches: readonly ConversationDispatch[];
}

export type CommandResult = {
  readonly run?: AgentRun;
  readonly runs?: readonly AgentRun[];
  readonly created?: boolean;
  readonly conversationId?: string;
  readonly participant?: Participant;
};

export type ApplicationEvent = RuntimeLiveEvent;
export type ApplicationEventListener = (snapshot: ApplicationSnapshot) => void;
export type { ApplicationLogEntry };
