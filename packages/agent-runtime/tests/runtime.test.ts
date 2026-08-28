import { describe, expect, it } from "vitest";
import { FakeModel, ModelExecutionError, ToolRegistry } from "agent-core";
import type { ModelAdapter } from "agent-core";
import { AgentRuntime, MemoryRunStore, RunAlreadyActiveError } from "../src/index.js";

function input(model: ModelAdapter, runId = "run-1") {
  return {
    runId,
    model,
    tools: new ToolRegistry(),
    turn: { messages: [{ role: "user" as const, content: "hello" }] },
  };
}

describe("AgentRuntime", () => {
  it("executes a Turn and persists the completed Run and events", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun(
      input(new FakeModel([{ type: "text", content: "hi" }])),
    );

    expect(run.status).toBe("completed");
    expect(run.version).toBe(2);
    expect(run.startedAt).toBeDefined();
    expect(run.finishedAt).toBeDefined();
    expect((await store.listEvents("run-1")).map((event) => event.type)).toEqual([
      "run_queued",
      "run_started",
      "turn.model_requested",
      "turn.turn_finished",
    ]);
  });

  it("maps clarification to a waiting Run", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun(
      input(new FakeModel([{ type: "status", status: "needs_clarification" }])),
    );

    expect(run.status).toBe("waiting");
  });

  it("maps a model exception to a failed Run", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun(
      input(new FakeModel([new Error("model unavailable")])),
    );

    expect(run.status).toBe("failed");
    expect((await store.listEvents("run-1")).at(-1)?.type).toBe("run_failed");
  });

  it("cancels an active Run through its AbortController", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const model: ModelAdapter = {
      complete: async (_input, options) => {
        markStarted();
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener?.("abort", () => reject(new Error("aborted")));
        });
      },
    };

    const execution = runtime.startRun(input(model, "cancel-me"));
    await started;
    expect(runtime.cancelRun("cancel-me")).toBe(true);
    expect((await execution).status).toBe("cancelled");
    expect(runtime.cancelRun("cancel-me")).toBe(false);
    expect((await store.listEvents("cancel-me")).at(-1)?.type).toBe("run_cancelled");
  });
  it("rejects a second concurrent start for the same Run", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const model: ModelAdapter = {
      complete: async (_input, options) => {
        markStarted();
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener?.("abort", () => reject(new Error("aborted")));
        });
      },
    };

    const first = runtime.startRun(input(model, "same-run"));
    await started;
    await expect(runtime.startRun(input(model, "same-run"))).rejects.toBeInstanceOf(
      RunAlreadyActiveError,
    );
    expect(runtime.cancelRun("same-run")).toBe(true);
    expect((await first).status).toBe("cancelled");
  });

  it("retries a retryable failure and increments attempt", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun({
      ...input(
        new FakeModel([
          new ModelExecutionError("timeout", "temporary outage", { retryable: true }),
          { type: "text", content: "recovered" },
        ]),
        "retry-me",
      ),
      retryPolicy: { maxAttempts: 2 },
    });

    expect(run.status).toBe("completed");
    expect(run.attempt).toBe(2);
    expect((await store.listEvents("retry-me")).map((event) => event.type)).toContain(
      "run_retrying",
    );
    expect((await store.listEvents("retry-me")).map((event) => event.type)).toContain(
      "run_restarted",
    );
  });

  it("does not retry a non-retryable failure", async () => {
    const model = new FakeModel([
      new ModelExecutionError("invalid_response", "bad response"),
      { type: "text", content: "must not run" },
    ]);
    const run = await new AgentRuntime(new MemoryRunStore()).startRun({
      ...input(model, "no-retry"),
      retryPolicy: { maxAttempts: 3 },
    });

    expect(run.status).toBe("failed");
    expect(model.requests).toHaveLength(1);
  });
});
