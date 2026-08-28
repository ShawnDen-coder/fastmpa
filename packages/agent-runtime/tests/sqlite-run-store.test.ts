import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("runs migrations once and preserves data across reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-runtime-"));
    const filePath = join(directory, "runtime.db");

    try {
      const first = await SqliteRunStore.open({ filePath });
      await first.create(makeRun());
      await first.appendEvent({
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      });
      first.close();

      const second = await SqliteRunStore.open({ filePath });
      await expect(second.get("run-1")).resolves.toMatchObject({
        runId: "run-1",
        status: "queued",
      });
      await expect(second.listEvents("run-1")).resolves.toHaveLength(1);
      second.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("atomically claims a queued Run and rejects a second owner", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.create(makeRun());
      const now = "2026-08-28T00:00:00.000Z";
      await expect(
        store.claim?.("run-1", "worker-a", now, 30_000),
      ).resolves.toMatchObject({
        runId: "run-1",
        ownerId: "worker-a",
        leaseUntil: "2026-08-28T00:00:30.000Z",
      });
      await expect(
        store.claim?.("run-1", "worker-b", now, 30_000),
      ).resolves.toBeUndefined();
      await expect(store.get("run-1")).resolves.toMatchObject({
        status: "queued",
      });
    } finally {
      store.close();
    }
  });

  it("allows a second owner to claim after the lease expires", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.create(makeRun());
      await store.claim?.(
        "run-1",
        "worker-a",
        "2026-08-28T00:00:00.000Z",
        30_000,
      );
      await expect(
        store.claim?.("run-1", "worker-b", "2026-08-28T00:00:31.000Z", 30_000),
      ).resolves.toMatchObject({ ownerId: "worker-b" });
    } finally {
      store.close();
    }
  });
});
