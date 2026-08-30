import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApplicationLogStore } from "../src/application/application-log.js";

describe("ApplicationLogStore", () => {
  it("tees structured Pino lines to JSONL, ring buffer, and subscribers", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-log-test-"));
    const path = join(directory, "fastmpa.log");
    const store = new ApplicationLogStore(path, 2);
    const received: number[] = [];
    store.subscribe((entry) => received.push(entry.sequence));
    store.write(
      `${JSON.stringify({
        time: "2026-01-01T00:00:00.000Z",
        level: "info",
        component: "application",
        msg: "started",
        workspaceId: "workspace-a",
      })}\n`,
    );
    store.write(
      `${JSON.stringify({
        time: "2026-01-01T00:00:01.000Z",
        level: "warn",
        component: "runtime",
        msg: "slow",
        runId: "run-1",
      })}\n`,
    );
    store.write(
      `${JSON.stringify({
        time: "2026-01-01T00:00:02.000Z",
        level: "error",
        component: "runtime",
        msg: "failed",
      })}\n`,
    );
    expect(store.getRecent()).toHaveLength(2);
    expect(store.getRecent()[0]).toMatchObject({
      sequence: 2,
      level: "warn",
      context: { runId: "run-1" },
    });
    expect(received).toEqual([1, 2, 3]);
    await store.close();
    expect(
      (await readFile(path, "utf8")).split("\n").filter(Boolean),
    ).toHaveLength(3);
    await rm(directory, { recursive: true, force: true });
  });
});
