export type ParticipantKind = "human" | "agent";
export type ParticipantStatus = "active" | "inactive";

export interface AgentProfile {
  /** Key resolved through the application model registry. */
  modelKey: string;
  /** @deprecated Use modelKey. Kept for persisted V1 records. */
  model?: string;
  persona: string;
  role: string;
  capabilities: readonly string[];
  toolNames: readonly string[];
}

export interface Participant {
  id: string;
  workspaceId: string;
  kind: ParticipantKind;
  name: string;
  status: ParticipantStatus;
  agent?: AgentProfile;
}

export interface AgentInput {
  id?: string;
  name: string;
  modelKey: string;
  persona: string;
  role: string;
  capabilities: readonly string[];
  toolNames: readonly string[];
}

export type AgentPatch = Partial<Omit<AgentInput, "id">>;

export function normalizeParticipantName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function isActiveAgent(participant: Participant | undefined): boolean {
  return participant?.kind === "agent" && participant.status === "active";
}
