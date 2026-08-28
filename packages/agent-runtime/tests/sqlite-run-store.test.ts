import { describe, expect, it } from "vitest";
import { SqliteRunStore } from "../src/index.js";
import type { AgentRun, RuntimeEvent } from "../src/types/index.js";

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: "run-1",
    status: "queued",
    attempt: 1,
    version: 0,
    createdAt: "2026-08-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("SqliteRunStore transactions", () => {
  it("rolls back the Run when the combined transition is invalid", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.create(makeRun());
      const event: RuntimeEvent = {
        runId: "run-1",
        sequence: 0,
        type: "run_completed",
        occurredAt: "2026-08-28T00:00:00.000Z",
      };

      await expect(
        store.transitionWithEvent(
          "run-1",
          0,
          makeRun({ status: "completed", version: 1 }),
          event,
        ),
      ).rejects.toThrow("Invalid AgentRun transition");
      await expect(store.get("run-1")).resolves.toMatchObject({
        status: "queued",
        version: 0,
      });
      await expect(store.listEvents("run-1")).resolves.toHaveLength(0);
    } finally {
      store.close();
    }
  });
});
