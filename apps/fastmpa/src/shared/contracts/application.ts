import type { AgentRun, RuntimeLiveEvent } from "@shawnden-coder/agent-runtime";
import type { ApplicationLogEntry } from "./logging.js";
import type {
  AgentInputDto,
  AgentPatchDto,
  GroupRoutingPolicyDto,
  ParticipantDto,
} from "./workspace.js";

export type ApplicationCommand =
  | { type: "workspace.create"; name: string; workspaceId?: string }
  | { type: "workspace.rename"; workspaceId: string; name: string }
  | { type: "agent.create"; workspaceId: string; input: AgentInputDto }
  | {
      type: "agent.update";
      workspaceId: string;
      agentId: string;
      patch: AgentPatchDto;
    }
  | { type: "agent.activate"; workspaceId: string; agentId: string }
  | { type: "agent.archive"; workspaceId: string; agentId: string }
  | {
      type: "conversation.direct.open";
      workspaceId: string;
      agentId: string;
      conversationId?: string;
    }
  | {
      type: "conversation.group.create";
      workspaceId: string;
      title: string;
      agentIds: readonly string[];
      routing?: Partial<GroupRoutingPolicyDto>;
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

export type CommandResult = {
  readonly run?: AgentRun;
  readonly runs?: readonly AgentRun[];
  readonly created?: boolean;
  readonly conversationId?: string;
  readonly participant?: ParticipantDto;
};

export type ApplicationEvent = RuntimeLiveEvent;
export type { ApplicationLogEntry };
