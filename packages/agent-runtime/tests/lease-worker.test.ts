import {
  FakeModel,
  ModelExecutionError,
  ToolRegistry,
} from "@shawnden-coder/agent-core";
import { describe, expect, it } from "vitest";
import {
  type Clock,
  LeaseRuntimeWorker,
  type RunDependencyResolver,
  SqliteRunStore,
} from "../src/index.js";

const initialTime = "2026-08-28T00:00:00.000Z";

function resolver(model: FakeModel): RunDependencyResolver {
  return {
    resolveModel: (key) => {
      if (key !== "test-model") throw new Error(`unknown model: ${key}`);
      return model;
    },
    resolveTools: (key) => {
      if (key !== "test-tools") throw new Error(`unknown toolset: ${key}`);
      return new ToolRegistry();
    },
  };
}

function worker(
  store: SqliteRunStore,
  model: FakeModel,
  clock: Clock = { now: () => initialTime },
  ownerId = "worker-a",
): LeaseRuntimeWorker {
  return new LeaseRuntimeWorker(store, {
    ownerId,
    leaseMs: 30_000,
    resolver: resolver(model),
    clock,
  });
}

async function enqueue(
  worker: LeaseRuntimeWorker,
  runId = "run-1",
): Promise<void> {
  await worker.enqueue({
    runId,
    turn: { messages: [{ role: "user", content: "hello" }] },
    dependencies: { modelKey: "test-model", toolsetKey: "test-tools" },
  });
}

describe("LeaseRuntimeWorker", () => {
  it("persists dependency keys and executes a claimed queued Run", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      const instance = worker(
        store,
        new FakeModel([{ type: "text", content: "done" }]),
      );
      await enqueue(instance);

      await expect(instance.run("run-1")).resolves.toMatchObject({
        status: "completed",
        attempt: 1,
      });
      await expect(store.get("run-1")).resolves.toMatchObject({
        input: {
          dependencies: { modelKey: "test-model", toolsetKey: "test-tools" },
        },
      });
      expect(
        (await store.listEvents("run-1")).map((event) => event.type),
      ).toEqual([
        "run_queued",
        "run_started",
        "turn.model_requested",
        "turn.turn_finished",
        "run_completed",
      ]);
    } finally {
      store.close();
    }
  });

  it("allows only one worker to claim the same Run", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      const first = worker(
        store,
        new FakeModel([{ type: "text", content: "done" }]),
      );
      const second = worker(
        store,
        new FakeModel([{ type: "text", content: "unexpected" }]),
        { now: () => initialTime },
        "worker-b",
      );
      await enqueue(first);

      const results = await Promise.all([
        first.run("run-1"),
        second.run("run-1"),
      ]);
      expect(
        results.filter((result) => result?.status === "completed"),
      ).toHaveLength(1);
      expect(results.filter((result) => result === undefined)).toHaveLength(1);
      await expect(store.listEvents("run-1")).resolves.toHaveLength(5);
    } finally {
      store.close();
    }
  });

  it("retries persisted work only when its policy permits it", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      const instance = worker(
        store,
        new FakeModel([
          new ModelExecutionError("timeout", "temporary outage", {
            retryable: true,
          }),
          { type: "text", content: "recovered" },
        ]),
      );
      await instance.enqueue({
        runId: "run-1",
        turn: { messages: [{ role: "user", content: "hello" }] },
        dependencies: { modelKey: "test-model", toolsetKey: "test-tools" },
        retryPolicy: { maxAttempts: 2 },
      });

      await expect(instance.run("run-1")).resolves.toMatchObject({
        status: "completed",
        attempt: 2,
      });
      expect(
        (await store.listEvents("run-1")).map((event) => event.type),
      ).toContain("run_retrying");
      expect(
        (await store.listEvents("run-1")).map((event) => event.type),
      ).toContain("run_restarted");
    } finally {
      store.close();
    }
  });

  it("does not retry a persisted Turn after a successful tool side effect", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      const tools = new ToolRegistry();
      let executions = 0;
      tools.register({
        definition: {
          name: "side_effect",
          description: "records a side effect",
          parameters: {},
        },
        validate: () => undefined,
        execute: () => {
          executions += 1;
          return "done";
        },
      });
      const model = new FakeModel([
        {
          type: "tool_calls",
          content: "",
          toolCalls: [{ id: "call-1", name: "side_effect", arguments: "{}" }],
        },
        new ModelExecutionError("timeout", "temporary outage", {
          retryable: true,
        }),
        { type: "text", content: "must not run" },
      ]);
      const instance = new LeaseRuntimeWorker(store, {
        ownerId: "worker-a",
        leaseMs: 30_000,
        clock: { now: () => initialTime },
        resolver: {
          resolveModel: () => model,
          resolveTools: () => tools,
        },
      });
      await instance.enqueue({
        runId: "run-1",
        turn: { messages: [{ role: "user", content: "hello" }] },
        dependencies: { modelKey: "test-model", toolsetKey: "test-tools" },
        retryPolicy: { maxAttempts: 2 },
      });

      await expect(instance.run("run-1")).resolves.toMatchObject({
        status: "failed",
      });
      expect(executions).toBe(1);
      expect(
        (await store.listEvents("run-1")).map((event) => event.type),
      ).not.toContain("run_retrying");
    } finally {
      store.close();
    }
  });

  it("keeps waiting Runs explicit and resumes them with persisted dependencies", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      const instance = worker(
        store,
        new FakeModel([
          { type: "status", status: "waiting" },
          { type: "text", content: "continued" },
        ]),
      );
      await enqueue(instance);
      await expect(instance.run("run-1")).resolves.toMatchObject({
        status: "waiting",
      });

      await expect(
        instance.resumeRun("run-1", {
          messages: [{ role: "user", content: "approved" }],
        }),
      ).resolves.toMatchObject({ status: "completed", attempt: 2 });
      expect(
        (await store.listEvents("run-1")).map((event) => event.type),
      ).toEqual([
        "run_queued",
        "run_started",
        "turn.model_requested",
        "turn.turn_finished",
        "run_waiting",
        "run_resumed",
        "run_started",
        "turn.model_requested",
        "turn.turn_finished",
        "run_completed",
      ]);
    } finally {
      store.close();
    }
  });

  it("recovers an expired owner and runs the requeued persisted Run", async () => {
    const store = await SqliteRunStore.open({ filePath: ":memory:" });
    try {
      const producer = worker(store, new FakeModel([]));
      await enqueue(producer);
      await store.claimAndStart("run-1", "crashed-worker", initialTime, 30_000);
      const recovered = worker(
        store,
        new FakeModel([{ type: "text", content: "recovered" }]),
        { now: () => "2026-08-28T00:00:31.000Z" },
        "recovery-worker",
      );

      await expect(recovered.recoverAndRun(10)).resolves.toEqual(["run-1"]);
      await expect(store.get("run-1")).resolves.toMatchObject({
        status: "completed",
        attempt: 2,
        version: 5,
      });
      expect(
        (await store.listEvents("run-1")).map((event) => event.type),
      ).toEqual([
        "run_queued",
        "run_started",
        "run_interrupted",
        "run_requeued",
        "run_started",
        "turn.model_requested",
        "turn.turn_finished",
        "run_completed",
      ]);
    } finally {
      store.close();
    }
  });
});
