import { FakeModel, ToolRegistry } from "@shawnden-coder/agent-core";
import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  DefaultRuntimeTooling,
  ToolCatalog,
  ToolPipeline,
} from "../src/index.js";
import { MemoryRunStore } from "../src/testing.js";

const fixedTime = "2026-08-28T00:00:00.000Z";

describe("AgentRuntime dependencies", () => {
  it("projects only the tools allowed by the Run context", () => {
    const catalog = new ToolCatalog();
    for (const name of ["allowed.tool", "hidden.tool"])
      catalog.register({
        definition: { name, description: name, parameters: {} },
        effect: "read",
        execute: async () => name,
      });
    const tooling = new DefaultRuntimeTooling(
      catalog,
      new ToolPipeline(catalog),
    );
    const tools = tooling.resolveTools({
      runId: "run",
      attempt: 1,
      agentId: "agent",
      workspaceId: "workspace",
      toolsetKey: "local",
      toolNames: ["allowed.tool"],
    });
    expect(tools.definitions().map((tool) => tool.name)).toEqual([
      "allowed.tool",
    ]);
  });

  it("uses the injected clock for Run and event timestamps", async () => {
    const runtime = new AgentRuntime(new MemoryRunStore(), {
      clock: { now: () => fixedTime },
    });

    const run = await runtime.startRun({
      runId: "fixed-clock-run",
      model: new FakeModel([{ type: "text", content: "ok" }]),
      tools: new ToolRegistry(),
      turn: { messages: [{ role: "user", content: "hello" }] },
    });
    const events = await runtime.listEvents("fixed-clock-run");

    expect(run.createdAt).toBe(fixedTime);
    expect(run.startedAt).toBe(fixedTime);
    expect(run.finishedAt).toBe(fixedTime);
    expect(events.every((event) => event.occurredAt === fixedTime)).toBe(true);
  });
});
