import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonFileRunStore } from "../src/index.js";
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

describe("JsonFileRunStore", () => {
  it("persists Runs and events for a newly created Store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-runtime-"));
    const filePath = join(directory, "runtime.json");

    try {
      const store = new JsonFileRunStore(filePath);
      await store.create(makeRun());
      const event: RuntimeEvent = {
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      };
      await store.appendEvent(event);
      await store.transition(
        "run-1",
        0,
        makeRun({ status: "running", version: 1 }),
      );

      const reloaded = new JsonFileRunStore(filePath);
      await expect(reloaded.get("run-1")).resolves.toMatchObject({
        status: "running",
        version: 1,
      });
      await expect(reloaded.listEvents("run-1")).resolves.toEqual([event]);
      await expect(readFile(filePath, "utf8")).resolves.toContain("run-1");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
