import { describe, expect, it } from "vitest";
import type { RunStore } from "../src/store/index.js";
import type { AgentRun, RuntimeEvent } from "../src/types/index.js";

interface StoreFixture {
  readonly store: RunStore;
  readonly cleanup?: () => Promise<void>;
}

export function describeRunStore(
  name: string,
  createFixture: () => Promise<StoreFixture>,
): void {
  describe(`${name} contract`, () => {
    it("creates and reads an isolated Run snapshot", async () => {
      const fixture = await createFixture();
      try {
        const run = makeRun();
        await fixture.store.create(run);
        const loaded = await fixture.store.get(run.runId);
        expect(loaded).toEqual(run);
        expect(loaded).not.toBe(run);
      } finally {
        await fixture.cleanup?.();
      }
    });

    it("rejects duplicate Runs and unknown Run operations", async () => {
      const fixture = await createFixture();
      try {
        await fixture.store.create(makeRun());
        await expect(fixture.store.create(makeRun())).rejects.toThrow();
        await expect(fixture.store.get("missing")).resolves.toBeUndefined();
        await expect(fixture.store.listEvents("missing")).rejects.toThrow();
      } finally {
        await fixture.cleanup?.();
      }
    });

    it("enforces versions and lifecycle transitions", async () => {
      const fixture = await createFixture();
      try {
        await fixture.store.create(makeRun());
        await expect(
          fixture.store.transition("run-1", 1, makeRun({ status: "running", version: 2 })),
        ).rejects.toThrow();
        await expect(
          fixture.store.transition("run-1", 0, makeRun({ status: "completed", version: 1 })),
        ).rejects.toThrow();
        await expect(
          fixture.store.transition("run-1", 0, makeRun({ status: "running", version: 1 })),
        ).resolves.toMatchObject({ status: "running", version: 1 });
      } finally {
        await fixture.cleanup?.();
      }
    });

    it("requires strictly increasing event sequences", async () => {
      const fixture = await createFixture();
      try {
        await fixture.store.create(makeRun());
        await fixture.store.appendEvent(makeEvent(0));
        await fixture.store.appendEvent(makeEvent(1));
        await expect(fixture.store.appendEvent(makeEvent(1))).rejects.toThrow();
        await expect(fixture.store.listEvents("run-1")).resolves.toHaveLength(2);
      } finally {
        await fixture.cleanup?.();
      }
    });
  });
}

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

function makeEvent(sequence: number): RuntimeEvent {
  return {
    runId: "run-1",
    sequence,
    type: "run_started",
    occurredAt: "2026-08-28T00:00:00.000Z",
  };
}
