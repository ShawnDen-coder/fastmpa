export interface WorkspaceDto {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ParticipantKindDto = "human" | "agent";
export type ParticipantStatusDto = "active" | "inactive";

export interface AgentProfileDto {
  readonly modelKey: string;
  readonly model?: string;
  readonly persona: string;
  readonly role: string;
  readonly capabilities: readonly string[];
  readonly toolNames: readonly string[];
}

export interface ParticipantDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: ParticipantKindDto;
  readonly name: string;
  readonly status: ParticipantStatusDto;
  readonly agent?: AgentProfileDto;
}

export interface AgentInputDto {
  readonly id?: string;
  readonly name: string;
  readonly modelKey: string;
  readonly persona: string;
  readonly role: string;
  readonly capabilities: readonly string[];
  readonly toolNames: readonly string[];
}

export type AgentPatchDto = Partial<Omit<AgentInputDto, "id">>;

export interface GroupRoutingPolicyDto {
  readonly mode: "auto";
  readonly routerModelKey: string;
  readonly fallbackAgentId: string;
  readonly maxAgents: number;
}

export type ConversationKindDto = "direct" | "group";

export interface ConversationDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind?: ConversationKindDto;
  readonly title?: string;
  readonly participantIds: readonly string[];
  readonly routing?: GroupRoutingPolicyDto;
  readonly createdAt: string;
}

export interface MessageDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly body: string;
  readonly mentions: readonly string[];
  readonly sequence: number;
  readonly createdAt: string;
}

export interface ScheduleDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly intervalMs: number;
  readonly nextRunAt: number;
  readonly instruction: string;
  readonly enabled?: boolean;
  readonly lastRunAt?: number;
  readonly lastRunId?: string;
  readonly lastError?: string;
  readonly consecutiveFailures?: number;
  readonly nextAttemptAt?: number;
  readonly createdAt: string;
}

export type ConversationDispatchStatusDto =
  | "routing"
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "partial"
  | "failed";

export type DispatchAssignmentStatusDto =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "cancelled"
  | "failed";

export interface DispatchAssignmentDto {
  readonly agentId: string;
  readonly runId: string;
  readonly instruction: string;
  readonly reason: string;
  readonly status: DispatchAssignmentStatusDto;
}

export interface ConversationDispatchDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly status: ConversationDispatchStatusDto;
  readonly assignments: readonly DispatchAssignmentDto[];
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface CardDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly boardId: string;
  readonly columnId: string;
  readonly title: string;
  readonly description?: string;
  readonly assigneeId?: string;
  readonly position: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AttentionSnapshotDto {
  readonly workspaceId: string;
  readonly agentId: string;
  readonly inbox: readonly MessageDto[];
  readonly agenda: readonly CardDto[];
}
