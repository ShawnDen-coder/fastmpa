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

  it("atomically claims and starts a queued Run for one owner", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.createWithEvent(makeRun(), {
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      });
      const now = "2026-08-28T00:00:00.000Z";
      await expect(
        store.claimAndStart("run-1", "worker-a", now, 30_000),
      ).resolves.toMatchObject({
        runId: "run-1",
        ownerId: "worker-a",
        leaseUntil: "2026-08-28T00:00:30.000Z",
      });
      await expect(
        store.claimAndStart("run-1", "worker-b", now, 30_000),
      ).resolves.toBeUndefined();
      await expect(store.get("run-1")).resolves.toMatchObject({
        status: "running",
        version: 1,
        startedAt: now,
      });
      await expect(store.listEvents("run-1")).resolves.toMatchObject([
        { type: "run_queued", sequence: 0 },
        { type: "run_started", sequence: 1 },
      ]);
    } finally {
      store.close();
    }
  });

  it("does not claim a non-queued Run after its lease expires", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.createWithEvent(makeRun(), {
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      });
      await store.claimAndStart(
        "run-1",
        "worker-a",
        "2026-08-28T00:00:00.000Z",
        30_000,
      );
      await expect(
        store.claimAndStart(
          "run-1",
          "worker-b",
          "2026-08-28T00:00:31.000Z",
          30_000,
        ),
      ).resolves.toBeUndefined();
    } finally {
      store.close();
    }
  });

  it("renews only the current owner before its lease expires", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.createWithEvent(makeRun(), {
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      });
      await store.claimAndStart(
        "run-1",
        "worker-a",
        "2026-08-28T00:00:00.000Z",
        30_000,
      );

      await expect(
        store.renewLease(
          "run-1",
          "worker-a",
          "2026-08-28T00:00:10.000Z",
          30_000,
        ),
      ).resolves.toEqual({
        runId: "run-1",
        ownerId: "worker-a",
        leaseUntil: "2026-08-28T00:00:40.000Z",
      });
      await expect(
        store.renewLease(
          "run-1",
          "worker-b",
          "2026-08-28T00:00:11.000Z",
          30_000,
        ),
      ).resolves.toBeUndefined();
      await expect(
        store.renewLease(
          "run-1",
          "worker-a",
          "2026-08-28T00:00:41.000Z",
          30_000,
        ),
      ).resolves.toBeUndefined();
    } finally {
      store.close();
    }
  });

  it("releases a lease only when its owner records a lifecycle event", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.createWithEvent(makeRun(), {
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      });
      await store.claimAndStart(
        "run-1",
        "worker-a",
        "2026-08-28T00:00:00.000Z",
        30_000,
      );
      const waiting = makeRun({
        status: "waiting",
        version: 2,
        startedAt: "2026-08-28T00:00:00.000Z",
      });

      await expect(
        store.transitionAsOwnerWithEvent(
          "run-1",
          "worker-b",
          "2026-08-28T00:00:10.000Z",
          1,
          waiting,
          {
            runId: "run-1",
            sequence: 2,
            type: "run_waiting",
            occurredAt: "2026-08-28T00:00:10.000Z",
          },
          { releaseLease: true },
        ),
      ).resolves.toBeUndefined();
      await expect(store.get("run-1")).resolves.toMatchObject({
        status: "running",
        version: 1,
      });
      await expect(
        store.transitionAsOwnerWithEvent(
          "run-1",
          "worker-a",
          "2026-08-28T00:00:10.000Z",
          1,
          waiting,
          {
            runId: "run-1",
            sequence: 2,
            type: "run_waiting",
            occurredAt: "2026-08-28T00:00:10.000Z",
          },
          { releaseLease: true },
        ),
      ).resolves.toEqual(waiting);
      await expect(
        store.renewLease(
          "run-1",
          "worker-a",
          "2026-08-28T00:00:11.000Z",
          30_000,
        ),
      ).resolves.toBeUndefined();
      await expect(store.listEvents("run-1")).resolves.toMatchObject([
        { type: "run_queued", sequence: 0 },
        { type: "run_started", sequence: 1 },
        { type: "run_waiting", sequence: 2 },
      ]);
    } finally {
      store.close();
    }
  });

  it("requeues an expired execution through interrupted with ordered events", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.createWithEvent(makeRun(), {
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      });
      await store.claimAndStart(
        "run-1",
        "worker-a",
        "2026-08-28T00:00:00.000Z",
        30_000,
      );

      await expect(
        store.recoverExpiredRuns("2026-08-28T00:00:31.000Z", 10),
      ).resolves.toEqual(["run-1"]);
      await expect(store.get("run-1")).resolves.toMatchObject({
        status: "queued",
        attempt: 2,
        version: 3,
      });
      await expect(store.listEvents("run-1")).resolves.toMatchObject([
        { type: "run_queued", sequence: 0 },
        { type: "run_started", sequence: 1 },
        {
          type: "run_interrupted",
          sequence: 2,
          data: { reason: "lease_expired" },
        },
        { type: "run_requeued", sequence: 3, data: { attempt: 2 } },
      ]);
      await expect(
        store.recoverExpiredRuns("2026-08-28T00:00:31.000Z", 10),
      ).resolves.toEqual([]);
    } finally {
      store.close();
    }
  });

  it("requeues an expired retrying Run", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      await store.createWithEvent(makeRun(), {
        runId: "run-1",
        sequence: 0,
        type: "run_queued",
        occurredAt: "2026-08-28T00:00:00.000Z",
      });
      await store.claimAndStart(
        "run-1",
        "worker-a",
        "2026-08-28T00:00:00.000Z",
        30_000,
      );
      await store.transitionAsOwnerWithEvent(
        "run-1",
        "worker-a",
        "2026-08-28T00:00:10.000Z",
        1,
        makeRun({
          status: "retrying",
          version: 2,
          startedAt: "2026-08-28T00:00:00.000Z",
        }),
        {
          runId: "run-1",
          sequence: 2,
          type: "run_retrying",
          occurredAt: "2026-08-28T00:00:10.000Z",
        },
      );

      await expect(
        store.recoverExpiredRuns("2026-08-28T00:00:31.000Z", 10),
      ).resolves.toEqual(["run-1"]);
      await expect(store.get("run-1")).resolves.toMatchObject({
        status: "queued",
        attempt: 2,
        version: 4,
      });
    } finally {
      store.close();
    }
  });
});
