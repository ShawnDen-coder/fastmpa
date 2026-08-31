import { describe, expect, it } from "vitest";
import {
  AgentRouter,
  type AgentRoutingCandidate,
} from "../../src/application/dispatch/agent-router.js";

const candidates: readonly AgentRoutingCandidate[] = [
  {
    agentId: "research",
    name: "Research",
    role: "research",
    capabilities: ["search"],
    toolNames: [],
  },
  {
    agentId: "writer",
    name: "Writer",
    role: "writing",
    capabilities: ["write"],
    toolNames: [],
  },
];

describe("AgentRouter", () => {
  it("uses only explicitly mentioned active candidates without calling the model", async () => {
    let calls = 0;
    const router = new AgentRouter({
      complete: async () => {
        calls += 1;
        return { type: "text", content: "{}" };
      },
    });
    const result = await router.route({
      workspaceId: "w",
      conversationId: "c",
      messageId: "m",
      body: "@Research",
      recentContext: [],
      candidates,
      maxAgents: 3,
      fallbackAgentId: "research",
      mentionedAgentIds: ["research", "missing", "research"],
    });
    expect(result.source).toBe("mention");
    expect(result.selectedAgentIds).toEqual(["research"]);
    expect(calls).toBe(0);
  });

  it("accepts valid multi-agent structured output and caps it at five", async () => {
    const router = new AgentRouter({
      complete: async () => ({
        type: "text",
        content: JSON.stringify({
          assignments: [
            { agentId: "writer", instruction: "draft", reason: "writing" },
            { agentId: "research", instruction: "verify", reason: "facts" },
            { agentId: "invalid", instruction: "ignore", reason: "ignore" },
          ],
        }),
      }),
    });
    const result = await router.route({
      workspaceId: "w",
      conversationId: "c",
      messageId: "m",
      body: "help",
      recentContext: [],
      candidates,
      maxAgents: 5,
      fallbackAgentId: "research",
    });
    expect(result.source).toBe("router");
    expect(result.selectedAgentIds).toEqual(["writer", "research"]);
  });

  it("falls back on invalid, empty, or failed router output", async () => {
    for (const model of [
      {
        complete: async () => ({ type: "text" as const, content: "not-json" }),
      },
      {
        complete: async () => ({
          type: "text" as const,
          content: JSON.stringify({ assignments: [] }),
        }),
      },
      {
        complete: async () => {
          throw new Error("offline");
        },
      },
    ]) {
      const result = await new AgentRouter(model).route({
        workspaceId: "w",
        conversationId: "c",
        messageId: "m",
        body: "help",
        recentContext: [],
        candidates,
        maxAgents: 3,
        fallbackAgentId: "research",
      });
      expect(result).toMatchObject({
        source: "fallback",
        selectedAgentIds: ["research"],
      });
    }
  });
});
