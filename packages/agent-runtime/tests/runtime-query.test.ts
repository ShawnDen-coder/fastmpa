import { FakeModel, ToolRegistry } from "@shawnden-coder/agent-core";
import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/index.js";
import { MemoryRunStore } from "../src/testing.js";

function input() {
  return {
    runId: "query-run",
    model: new FakeModel([{ type: "text", content: "hello" }]),
    tools: new ToolRegistry(),
    turn: { messages: [{ role: "user" as const, content: "query" }] },
  };
}

describe("AgentRuntime query API", () => {
  it("returns the Run and ordered events as one snapshot", async () => {
    const runtime = new AgentRuntime(new MemoryRunStore());
    const completed = await runtime.startRun(input());

    await expect(runtime.getRun("query-run")).resolves.toEqual(completed);
    await expect(runtime.listEvents("query-run")).resolves.toHaveLength(5);
    await expect(
      runtime.listEvents("query-run", {
        type: "turn.model_requested",
        afterSequence: 1,
        limit: 1,
      }),
    ).resolves.toMatchObject([{ type: "turn.model_requested" }]);
    await expect(runtime.getRunSnapshot("query-run")).resolves.toMatchObject({
      run: completed,
      events: expect.arrayContaining([
        expect.objectContaining({ type: "run_queued" }),
        expect.objectContaining({ type: "turn.turn_finished" }),
        expect.objectContaining({ type: "run_completed" }),
      ]),
    });
  });

  it("returns undefined for a missing Run snapshot", async () => {
    const runtime = new AgentRuntime(new MemoryRunStore());

    await expect(
      runtime.getRunSnapshot("missing-run"),
    ).resolves.toBeUndefined();
  });
});
