import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeModel, ToolRegistry } from "@shawnden-coder/agent-core";
import { describe, expect, it } from "vitest";
import { AgentRuntime, SqliteRunStore } from "../src/index.js";

function input(runId: string) {
  return {
    runId,
    model: new FakeModel([{ type: "text", content: "persisted" }]),
    tools: new ToolRegistry(),
    turn: { messages: [{ role: "user" as const, content: "hello" }] },
  };
}

describe("AgentRuntime with SQLite", () => {
  it("persists a completed Run and events across runtime recreation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-runtime-"));
    const filePath = join(directory, "runtime.db");
    try {
      const firstStore = await SqliteRunStore.open({ filePath });
      const firstRuntime = new AgentRuntime(firstStore);
      const completed = await firstRuntime.startRun(input("run-1"));
      const firstEvents = await firstStore.listEvents("run-1");
      firstStore.close();

      const secondStore = await SqliteRunStore.open({ filePath });
      const secondRuntime = new AgentRuntime(secondStore);
      const restored = await secondRuntime.getRun("run-1");
      const secondEvents = await secondStore.listEvents("run-1");
      secondStore.close();

      expect(completed.status).toBe("completed");
      expect(restored).toEqual(completed);
      expect(restored?.input).toMatchObject({
        turn: { messages: [{ role: "user", content: "hello" }] },
      });
      expect(restored?.result).toMatchObject({
        status: "done",
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "persisted" },
        ],
        steps: 1,
      });
      expect(secondEvents).toEqual(firstEvents);
      expect(secondEvents.map((event) => event.type)).toEqual([
        "run_queued",
        "run_started",
        "turn.model_requested",
        "turn.turn_finished",
        "run_completed",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
