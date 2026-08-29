export type ParticipantKind = "human" | "agent";
export type ParticipantStatus = "active" | "inactive";

export interface AgentProfile {
  model?: string;
  persona?: string;
  toolNames?: readonly string[];
}

export interface Participant {
  id: string;
  workspaceId: string;
  kind: ParticipantKind;
  name: string;
  role?: string;
  status: ParticipantStatus;
  agent?: AgentProfile;
}
