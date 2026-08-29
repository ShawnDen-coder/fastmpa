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

    it("creates the Run and its initial event together", async () => {
      const fixture = await createFixture();
      try {
        const run = makeRun();
        const event = makeEvent(0);
        await fixture.store.createWithEvent(run, event);

        await expect(fixture.store.get(run.runId)).resolves.toEqual(run);
        await expect(fixture.store.listEvents(run.runId)).resolves.toEqual([
          event,
        ]);
      } finally {
        await fixture.cleanup?.();
      }
    });

    it("does not create a Run when its initial event is invalid", async () => {
      const fixture = await createFixture();
      try {
        const run = makeRun();
        await expect(
          fixture.store.createWithEvent(run, {
            ...makeEvent(0),
            runId: "other-run",
          }),
        ).rejects.toThrow("RuntimeEvent id mismatch");
        await expect(fixture.store.get(run.runId)).resolves.toBeUndefined();
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
          fixture.store.transition(
            "run-1",
            1,
            makeRun({ status: "running", version: 2 }),
          ),
        ).rejects.toThrow();
        await expect(
          fixture.store.transition(
            "run-1",
            0,
            makeRun({ status: "completed", version: 1 }),
          ),
        ).rejects.toThrow();
        await expect(
          fixture.store.transition(
            "run-1",
            0,
            makeRun({ status: "running", version: 1 }),
          ),
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
        await expect(fixture.store.listEvents("run-1")).resolves.toHaveLength(
          2,
        );
      } finally {
        await fixture.cleanup?.();
      }
    });

    it("keeps Run and event unchanged when an atomic transition is invalid", async () => {
      const fixture = await createFixture();
      try {
        const run = makeRun();
        await fixture.store.createWithEvent(run, makeEvent(0));
        await expect(
          fixture.store.transitionWithEvent(
            run.runId,
            run.version,
            makeRun({ status: "running", version: 1 }),
            { ...makeEvent(0), type: "run_started" },
          ),
        ).rejects.toThrow();
        await expect(fixture.store.get(run.runId)).resolves.toEqual(run);
        await expect(fixture.store.listEvents(run.runId)).resolves.toEqual([
          makeEvent(0),
        ]);
      } finally {
        await fixture.cleanup?.();
      }
    });

    it("paginates Runs by a stable createdAt and runId cursor", async () => {
      const fixture = await createFixture();
      try {
        await fixture.store.create(makeRun({ runId: "run-2" }));
        await fixture.store.create(
          makeRun({ runId: "run-1", createdAt: "2026-08-27T00:00:00.000Z" }),
        );
        await fixture.store.create(
          makeRun({ runId: "run-3", createdAt: "2026-08-29T00:00:00.000Z" }),
        );

        const first = await fixture.store.listRuns({ limit: 2 });
        expect(first.runs.map((run) => run.runId)).toEqual(["run-1", "run-2"]);
        expect(first.nextCursor).toBeDefined();

        await expect(
          fixture.store.listRuns({ limit: 2, cursor: first.nextCursor }),
        ).resolves.toMatchObject({ runs: [{ runId: "run-3" }] });
        await expect(fixture.store.listRuns({ status: "queued" })).resolves.toMatchObject({
          runs: [{ runId: "run-1" }, { runId: "run-2" }, { runId: "run-3" }],
        });
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
