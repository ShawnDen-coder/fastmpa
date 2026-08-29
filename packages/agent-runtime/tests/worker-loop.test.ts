import { describe, expect, it } from "vitest";
import type { RunLeaseStore } from "../src/store/index.js";
import { RuntimeWorkerLoop } from "../src/worker-loop.js";

describe("RuntimeWorkerLoop", () => {
  it("recovers expired runs, consumes queued runs, and prevents overlapping scans", async () => {
    const runs = [{ runId: "queued-1" }, { runId: "queued-2" }];
    let recoverCalls = 0;
    const consumed: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = {
      recoverAndRun: async () => {
        recoverCalls += 1;
        await gate;
        return ["recovered-1"] as const;
      },
      run: async (runId: string) => {
        consumed.push(runId);
        return undefined;
      },
    };
    const store = {
      listRuns: async () => ({ runs }),
    } as unknown as RunLeaseStore;
    const loop = new RuntimeWorkerLoop({ worker, store, batchSize: 2 });

    const first = loop.tick();
    const second = loop.tick();
    expect(first).toBe(second);
    release();
    await expect(first).resolves.toEqual([
      "recovered-1",
      "queued-1",
      "queued-2",
    ]);
    expect(recoverCalls).toBe(1);
    expect(consumed).toEqual(["queued-1", "queued-2"]);
  });

  it("reports a failed run and continues consuming the batch", async () => {
    const errors: unknown[] = [];
    const worker = {
      recoverAndRun: async () => [] as const,
      run: async (runId: string) => {
        if (runId === "bad") throw new Error("boom");
        return undefined;
      },
    };
    const store = {
      listRuns: async () => ({ runs: [{ runId: "bad" }, { runId: "good" }] }),
    } as unknown as RunLeaseStore;
    const loop = new RuntimeWorkerLoop({
      worker,
      store,
      onError: (error) => errors.push(error),
    });

    await expect(loop.tick()).resolves.toEqual(["bad", "good"]);
    expect(errors).toHaveLength(1);
  });
});
