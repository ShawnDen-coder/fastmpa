import { describe, expect, it } from "vitest";
import { FakeModel, ToolRegistry } from "agent-core";
import { AgentRuntime, MemoryRunStore } from "../src/index.js";

function input(model: FakeModel, runId = "run-1") {
  return {
    runId,
    model,
    tools: new ToolRegistry(),
    turn: { messages: [{ role: "user" as const, content: "hello" }] },
  };
}

describe("AgentRuntime", () => {
  it("executes a Turn and persists the completed Run and events", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun(
      input(new FakeModel([{ type: "text", content: "hi" }])),
    );

    expect(run.status).toBe("completed");
    expect(run.version).toBe(2);
    expect(run.startedAt).toBeDefined();
    expect(run.finishedAt).toBeDefined();
    expect((await store.listEvents("run-1")).map((event) => event.type)).toEqual([
      "run_queued",
      "run_started",
      "turn.model_requested",
      "turn.turn_finished",
    ]);
  });

  it("maps clarification to a waiting Run", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun(
      input(new FakeModel([{ type: "status", status: "needs_clarification" }])),
    );

    expect(run.status).toBe("waiting");
  });

  it("maps a model exception to a failed Run", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun(
      input(new FakeModel([new Error("model unavailable")])),
    );

    expect(run.status).toBe("failed");
    expect((await store.listEvents("run-1")).at(-1)?.type).toBe("run_failed");
  });
});
