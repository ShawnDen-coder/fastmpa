import type { AttentionSnapshot, Schedule } from "workspace";
import type { WakeSignal } from "./scheduler.js";

export interface AgentContext {
  workspaceId: string;
  agentId: string;
  persona?: string;
  model?: string;
  toolNames: readonly string[];
  attention: AttentionSnapshot;
  wake: WakeSignal;
  schedule?: Schedule;
}

export function assembleAgentContext(
  attention: AttentionSnapshot,
  wake: WakeSignal,
  agent: {
    agent?: {
      modelKey?: string;
      persona?: string;
      model?: string;
      toolNames?: readonly string[];
    };
  },
  schedule?: Schedule,
): AgentContext {
  return {
    workspaceId: attention.workspaceId,
    agentId: attention.agentId,
    persona: agent.agent?.persona,
    model: agent.agent?.modelKey ?? agent.agent?.model,
    toolNames: agent.agent?.toolNames ?? [],
    attention,
    wake,
    schedule,
  };
}

export function contextMessages(
  context: AgentContext,
): readonly [
  { role: "system"; content: string },
  ...{ role: "user"; content: string }[],
] {
  const agenda =
    context.attention.agenda.map((card) => `- ${card.title}`).join("\n") ||
    "(none)";
  const persona = context.persona ?? "You are a helpful task agent.";
  const system = [
    persona,
    `Workspace: ${context.workspaceId}. Agent: ${context.agentId}.`,
    `Wake reason: ${context.wake.reason} (${context.wake.sourceRef.type}:${context.wake.sourceRef.id}).`,
    `Available tools: ${context.toolNames.join(", ") || "(resolved by runtime)"}.`,
    `Assigned agenda:\n${agenda}`,
    ...(context.schedule
      ? [`Schedule instruction:\n${context.schedule.instruction}`]
      : []),
  ].join("\n\n");
  const inbox = context.attention.inbox.map((message) => ({
    role: "user" as const,
    content: message.body,
  }));
  return [{ role: "system", content: system }, ...inbox];
}
