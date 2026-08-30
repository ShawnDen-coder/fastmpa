import { describe, expect, it } from "vitest";
import {
  DuplicateRunError,
  EventSequenceError,
  RunNotFoundError,
  RunVersionConflictError,
} from "../src/index.js";
import { MemoryRunStore } from "../src/testing.js";
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

function makeEvent(sequence: number, runId = "run-1"): RuntimeEvent {
  return {
    runId,
    sequence,
    type: "run_started",
    occurredAt: "2026-08-28T00:00:00.000Z",
    data: { sequence },
  };
}

describe("MemoryRunStore", () => {
  it("creates and returns an immutable run snapshot", async () => {
    const store = new MemoryRunStore();
    const run = makeRun();
    await store.create(run);

    const loaded = await store.get(run.runId);
    expect(loaded).toEqual(run);
    expect(loaded).not.toBe(run);
  });

  it("rejects duplicate run IDs", async () => {
    const store = new MemoryRunStore();
    await store.create(makeRun());
    await expect(store.create(makeRun())).rejects.toBeInstanceOf(
      DuplicateRunError,
    );
  });

  it("returns undefined for an unknown run", async () => {
    await expect(new MemoryRunStore().get("missing")).resolves.toBeUndefined();
  });

  it("transitions with an optimistic version check", async () => {
    const store = new MemoryRunStore();
    await store.create(makeRun());
    const next = await store.transition(
      "run-1",
      0,
      makeRun({ status: "running", version: 1 }),
    );
    expect(next.status).toBe("running");
    expect(next.version).toBe(1);
  });

  it("rejects stale versions", async () => {
    const store = new MemoryRunStore();
    await store.create(makeRun());
    await expect(
      store.transition("run-1", 1, makeRun({ status: "running", version: 2 })),
    ).rejects.toBeInstanceOf(RunVersionConflictError);
  });

  it("rejects illegal lifecycle transitions", async () => {
    const store = new MemoryRunStore();
    await store.create(makeRun());
    await expect(
      store.transition(
        "run-1",
        0,
        makeRun({ status: "completed", version: 1 }),
      ),
    ).rejects.toThrow("Invalid AgentRun transition: queued -> completed");
  });

  it("rejects transitions for unknown runs", async () => {
    await expect(
      new MemoryRunStore().transition(
        "missing",
        0,
        makeRun({ runId: "missing", status: "running", version: 1 }),
      ),
    ).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it("stores events in sequence order and returns snapshots", async () => {
    const store = new MemoryRunStore();
    await store.create(makeRun());
    await store.appendEvent(makeEvent(0));
    await store.appendEvent(makeEvent(1));
    const events = await store.listEvents("run-1");
    expect(events.map((event) => event.sequence)).toEqual([0, 1]);
    expect(events[0]).not.toBe((await store.listEvents("run-1"))[0]);
  });

  it("rejects duplicate or out-of-order events", async () => {
    const store = new MemoryRunStore();
    await store.create(makeRun());
    await store.appendEvent(makeEvent(1));
    await expect(store.appendEvent(makeEvent(1))).rejects.toBeInstanceOf(
      EventSequenceError,
    );
    await expect(store.appendEvent(makeEvent(0))).rejects.toBeInstanceOf(
      EventSequenceError,
    );
  });

  it("rejects events for unknown runs", async () => {
    await expect(
      new MemoryRunStore().appendEvent(makeEvent(0, "missing")),
    ).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
