import type { ModelAdapter } from "@shawnden-coder/agent-core";

export interface AgentRoutingCandidate {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly capabilities: readonly string[];
  readonly toolNames: readonly string[];
}

export interface RoutingContextMessage {
  readonly senderName: string;
  readonly senderId: string;
  readonly body: string;
}

export interface AgentRoutingRequest {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly body: string;
  readonly recentContext: readonly RoutingContextMessage[];
  readonly candidates: readonly AgentRoutingCandidate[];
  readonly maxAgents: number;
  readonly fallbackAgentId: string;
  readonly mentionedAgentIds?: readonly string[];
}

export interface AgentRoutingAssignment {
  readonly agentId: string;
  readonly instruction: string;
  readonly reason: string;
}

export interface AgentRoutingDecision {
  readonly selectedAgentIds: readonly string[];
  readonly assignments: readonly AgentRoutingAssignment[];
  readonly source: "mention" | "router" | "fallback";
}

export class AgentRouter {
  public constructor(private readonly model: ModelAdapter) {}

  public async route(
    request: AgentRoutingRequest,
  ): Promise<AgentRoutingDecision> {
    const candidates = new Map(
      request.candidates.map((candidate) => [candidate.agentId, candidate]),
    );
    const mentioned = uniqueActive(request.mentionedAgentIds ?? [], candidates);
    if (mentioned.length > 0)
      return decisionFor(
        mentioned,
        candidates,
        "mention",
        "Explicitly mentioned Agent",
      );

    try {
      const response = await this.model.complete({
        tools: [],
        messages: [
          {
            role: "system",
            content: [
              "You route a workspace message to active Agents.",
              'Return JSON only: {"assignments":[{"agentId":"...","instruction":"...","reason":"..."}]}',
              `Select at most ${Math.min(5, Math.max(1, request.maxAgents))} Agents from the candidates.`,
              JSON.stringify(request.candidates),
            ].join("\n"),
          },
          { role: "user", content: request.body },
        ],
      });
      const parsed = JSON.parse(
        response.type === "text" ? response.content : "",
      ) as unknown;
      const assignments = parseAssignments(parsed, candidates);
      const selected = assignments
        .map((assignment) => assignment.agentId)
        .filter((agentId, index, values) => values.indexOf(agentId) === index)
        .slice(0, Math.min(5, Math.max(1, request.maxAgents)));
      if (selected.length > 0)
        return {
          selectedAgentIds: selected,
          assignments: assignments.filter((item) =>
            selected.includes(item.agentId),
          ),
          source: "router",
        };
    } catch {
      // Invalid model output is equivalent to an unavailable router.
    }
    if (!candidates.has(request.fallbackAgentId))
      throw new Error("Routing fallback Agent is not an active candidate");
    return decisionFor(
      [request.fallbackAgentId],
      candidates,
      "fallback",
      "Router failed or returned no valid Agent",
    );
  }
}

function uniqueActive(
  ids: readonly string[],
  candidates: ReadonlyMap<string, AgentRoutingCandidate>,
): string[] {
  return ids.filter(
    (id, index) => candidates.has(id) && ids.indexOf(id) === index,
  );
}

function decisionFor(
  ids: readonly string[],
  candidates: ReadonlyMap<string, AgentRoutingCandidate>,
  source: AgentRoutingDecision["source"],
  reason: string,
): AgentRoutingDecision {
  const assignments = ids.map((agentId) => ({
    agentId,
    instruction: "Respond to the user's message using your assigned role.",
    reason:
      source === "mention"
        ? `@${candidates.get(agentId)?.name ?? agentId}`
        : reason,
  }));
  return { selectedAgentIds: [...ids], assignments, source };
}

function parseAssignments(
  value: unknown,
  candidates: ReadonlyMap<string, AgentRoutingCandidate>,
): AgentRoutingAssignment[] {
  if (!isRecord(value) || !Array.isArray(value.assignments)) return [];
  return value.assignments.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.agentId !== "string" ||
      !candidates.has(item.agentId)
    )
      return [];
    return [
      {
        agentId: item.agentId,
        instruction:
          typeof item.instruction === "string" && item.instruction.trim()
            ? item.instruction.trim()
            : "Respond to the user's message using your assigned role.",
        reason:
          typeof item.reason === "string" && item.reason.trim()
            ? item.reason.trim()
            : "Selected by router",
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
