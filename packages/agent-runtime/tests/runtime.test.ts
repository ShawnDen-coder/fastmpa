import type { ModelAdapter } from "@shawnden-coder/agent-core";
import {
  FakeModel,
  ModelExecutionError,
  ToolRegistry,
} from "@shawnden-coder/agent-core";
import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  MemoryRunStore,
  RunAlreadyActiveError,
  RunNotResumableError,
} from "../src/index.js";

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
    expect(
      (await store.listEvents("run-1")).map((event) => event.type),
    ).toEqual([
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
          options?.signal?.addEventListener?.("abort", () =>
            reject(new Error("aborted")),
          );
        });
      },
    };

    const execution = runtime.startRun(input(model, "cancel-me"));
    await started;
    expect(runtime.cancelRun("cancel-me")).toBe(true);
    expect((await execution).status).toBe("cancelled");
    expect(runtime.cancelRun("cancel-me")).toBe(false);
    expect((await store.listEvents("cancel-me")).at(-1)?.type).toBe(
      "run_cancelled",
    );
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
          options?.signal?.addEventListener?.("abort", () =>
            reject(new Error("aborted")),
          );
        });
      },
    };

    const first = runtime.startRun(input(model, "same-run"));
    await started;
    await expect(
      runtime.startRun(input(model, "same-run")),
    ).rejects.toBeInstanceOf(RunAlreadyActiveError);
    expect(runtime.cancelRun("same-run")).toBe(true);
    expect((await first).status).toBe("cancelled");
  });

  it("retries a retryable failure and increments attempt", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const run = await runtime.startRun({
      ...input(
        new FakeModel([
          new ModelExecutionError("timeout", "temporary outage", {
            retryable: true,
          }),
          { type: "text", content: "recovered" },
        ]),
        "retry-me",
      ),
      retryPolicy: { maxAttempts: 2 },
    });

    expect(run.status).toBe("completed");
    expect(run.attempt).toBe(2);
    expect(
      (await store.listEvents("retry-me")).map((event) => event.type),
    ).toContain("run_retrying");
    expect(
      (await store.listEvents("retry-me")).map((event) => event.type),
    ).toContain("run_restarted");
  });

  it("does not retry after a successful tool call in the failed Turn", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    let executions = 0;
    const tools = new ToolRegistry();
    tools.register({
      definition: {
        name: "side_effect",
        description: "performs a side effect",
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
      { type: "text", content: "must not retry" },
    ]);

    const run = await runtime.startRun({
      ...input(model, "side-effect-no-retry"),
      tools,
      retryPolicy: { maxAttempts: 2 },
    });

    expect(run.status).toBe("failed");
    expect(model.requests).toHaveLength(2);
    expect(executions).toBe(1);
    expect(
      (await store.listEvents("side-effect-no-retry")).map(
        (event) => event.type,
      ),
    ).not.toContain("run_retrying");
  });

  it("cancels while waiting between retry attempts", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const execution = runtime.startRun({
      ...input(
        new FakeModel([
          new ModelExecutionError("timeout", "temporary outage", {
            retryable: true,
          }),
          { type: "text", content: "must not run" },
        ]),
        "cancel-retry-delay",
      ),
      retryPolicy: { maxAttempts: 2, delayMs: 5_000 },
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(runtime.cancelRun("cancel-retry-delay")).toBe(true);
    expect((await execution).status).toBe("cancelled");
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

  it("resumes a waiting Run with a new attempt", async () => {
    const store = new MemoryRunStore();
    const runtime = new AgentRuntime(store);
    const waiting = await runtime.startRun({
      ...input(
        new FakeModel([{ type: "status", status: "waiting" }]),
        "resume-me",
      ),
    });

    const resumed = await runtime.resumeRun(
      "resume-me",
      input(new FakeModel([{ type: "text", content: "continued" }])),
    );
    const events = await store.listEvents("resume-me");

    expect(waiting.status).toBe("waiting");
    expect(resumed.status).toBe("completed");
    expect(resumed.attempt).toBe(2);
    expect(events.map((event) => event.sequence)).toEqual(
      [...events].map((_, index) => index),
    );
    expect(events.map((event) => event.type)).toContain("run_resumed");
  });

  it("rejects resuming a terminal Run", async () => {
    const runtime = new AgentRuntime(new MemoryRunStore());
    await runtime.startRun(
      input(new FakeModel([{ type: "text", content: "done" }]), "terminal"),
    );

    await expect(
      runtime.resumeRun("terminal", input(new FakeModel([]))),
    ).rejects.toBeInstanceOf(RunNotResumableError);
  });
});
