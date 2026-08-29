import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteApprovalStore } from "../src/approval-store.js";
import { ToolPipeline } from "../src/pipeline.js";
import {
  type RegisteredTool,
  ToolRegistry,
  toCoreToolRegistry,
} from "../src/registry.js";

function writeTool(): RegisteredTool {
  return {
    definition: {
      name: "write.example",
      description: "Write",
      parameters: { type: "object" },
    },
    effect: "write",
    execute: () => undefined,
  };
}

describe("tool-pipeline", () => {
  it("projects registered tools into the Core registry", async () => {
    const pipelineRegistry = new ToolRegistry();
    pipelineRegistry.register({
      definition: {
        name: "read.example",
        description: "Read example",
        parameters: { type: "object" },
      },
      effect: "read",
      execute: async () => ({ value: 1 }),
    });
    const coreRegistry = toCoreToolRegistry(pipelineRegistry.list());
    const tool = coreRegistry.get("read.example");
    expect(tool).toBeDefined();
    await expect(tool?.execute({}, {})).resolves.toEqual({ value: 1 });
  });

  it("does not expose write tools to the Core turn", () => {
    const writeTool = {
      definition: {
        name: "write.example",
        description: "Write",
        parameters: { type: "object" },
      },
      effect: "write" as const,
      execute: () => undefined,
    };
    expect(() => toCoreToolRegistry([writeTool])).toThrow("Only read tools");
  });

  it("maps Pipeline approval into a Core tool error when explicitly enabled", async () => {
    const registry = new ToolRegistry();
    registry.register(writeTool());
    const pipeline = new ToolPipeline(registry, undefined, () => "approval-1");
    const core = toCoreToolRegistry(registry.list(), {
      pipeline,
      actorId: "agent-1",
      idempotencyKeyPrefix: "run-1",
    });

    await expect(
      core.get("write.example")?.execute({}, {}),
    ).rejects.toMatchObject({
      code: "approval_required",
      details: { approvalId: "approval-1" },
    });
  });

  it("executes a read tool once for an idempotency key", async () => {
    const registry = new ToolRegistry();
    let calls = 0;
    registry.register({
      definition: {
        name: "tapd.list",
        description: "list",
        parameters: { required: ["project"] },
      },
      effect: "read",
      execute: () => {
        calls += 1;
        return { items: [] };
      },
    });
    const pipeline = new ToolPipeline(registry, undefined, () => "approval-1");
    const call = {
      id: "call-1",
      name: "tapd.list",
      arguments: JSON.stringify({ project: "7A" }),
    };
    const first = await pipeline.execute(call, {
      actorId: "agent-1",
      idempotencyKey: "read-1",
    });
    const second = await pipeline.execute(call, {
      actorId: "agent-1",
      idempotencyKey: "read-1",
    });
    expect(first.status).toBe("completed");
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    expect(pipeline.listJournal()).toHaveLength(1);
  });

  it("pauses write tools until approval and then executes them", async () => {
    const registry = new ToolRegistry();
    let updated = false;
    registry.register({
      definition: {
        name: "tapd.update",
        description: "update",
        parameters: { required: ["id", "iteration"] },
      },
      effect: "write",
      execute: () => {
        updated = true;
        return "updated";
      },
    });
    const pipeline = new ToolPipeline(registry, undefined, () => "approval-1");
    const pending = await pipeline.execute(
      {
        id: "call-2",
        name: "tapd.update",
        arguments: '{"id":"req-1","iteration":"Sprint 1"}',
      },
      { actorId: "agent-1", idempotencyKey: "write-1" },
    );
    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required")
      throw new Error("expected approval");
    expect(updated).toBe(false);
    const completed = await pipeline.approve(pending.approval.approvalId);
    expect(completed.status).toBe("completed");
    expect(updated).toBe(true);
  });

  it("restores a pending approval after the pipeline is recreated", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fastmpa-approval-"));
    const databasePath = join(directory, "pipeline.sqlite");
    const firstRegistry = new ToolRegistry();
    firstRegistry.register({
      ...writeTool(),
      execute: () => "updated-after-restart",
    });
    const firstStore = new SqliteApprovalStore(databasePath);
    const first = new ToolPipeline(
      firstRegistry,
      undefined,
      () => "approval-persisted",
      firstStore,
    );
    const pending = await first.execute(
      { id: "call-persisted", name: "write.example", arguments: "{}" },
      { actorId: "agent-1", idempotencyKey: "write-persisted" },
    );
    expect(pending.status).toBe("approval_required");
    firstStore.close();

    const secondRegistry = new ToolRegistry();
    secondRegistry.register({
      ...writeTool(),
      execute: () => "updated-after-restart",
    });
    const secondStore = new SqliteApprovalStore(databasePath);
    const second = new ToolPipeline(
      secondRegistry,
      undefined,
      () => "unused",
      secondStore,
    );
    await expect(second.approve("approval-persisted")).resolves.toMatchObject({
      status: "completed",
      result: { content: "updated-after-restart" },
    });
    await expect(
      second.execute(
        { id: "call-persisted", name: "write.example", arguments: "{}" },
        { actorId: "agent-1", idempotencyKey: "write-persisted" },
      ),
    ).resolves.toMatchObject({
      status: "completed",
      result: { content: "updated-after-restart" },
    });
    expect(second.listJournal()).toHaveLength(2);
    secondStore.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("rejects malformed arguments before executing a tool", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "read",
        description: "read",
        parameters: { required: ["id"] },
      },
      effect: "read",
      execute: () => "never",
    });
    const result = await new ToolPipeline(registry).execute(
      { id: "call-3", name: "read", arguments: "{}" },
      { actorId: "agent-1", idempotencyKey: "bad-1" },
    );
    expect(result.status).toBe("completed");
    if (result.status !== "completed")
      throw new Error("expected failed tool result");
    expect(result.result.ok).toBe(false);
    if (result.result.ok) throw new Error("expected failed tool result");
    expect(result.result.error.code).toBe("invalid_arguments");
  });

  it("can deny a tool before the executor is reached", async () => {
    const registry = new ToolRegistry();
    let executed = false;
    registry.register({
      definition: { name: "danger", description: "danger", parameters: {} },
      effect: "write",
      execute: () => {
        executed = true;
        return "no";
      },
    });
    const pipeline = new ToolPipeline(registry, { decide: () => "deny" });
    const result = await pipeline.execute(
      { id: "call-4", name: "danger", arguments: "{}" },
      { actorId: "agent-1", idempotencyKey: "deny-1" },
    );
    expect(result.status).toBe("rejected");
    expect(executed).toBe(false);
    expect(pipeline.listJournal()[0]?.status).toBe("denied");
  });

  it("preserves retry metadata for read failures but not write failures", async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: "read.unavailable",
        description: "read",
        parameters: {},
      },
      effect: "read",
      execute: () => {
        throw Object.assign(new Error("upstream unavailable"), {
          code: "tapd_api_error",
          statusCode: 503,
          retryable: true,
          info: "service unavailable",
        });
      },
    });
    registry.register({
      ...writeTool(),
      execute: () => {
        throw Object.assign(new Error("write outcome unknown"), {
          code: "tapd_api_error",
          statusCode: 503,
          retryable: true,
        });
      },
    });
    const pipeline = new ToolPipeline(registry);
    const read = await pipeline.execute(
      { id: "read-fail", name: "read.unavailable", arguments: "{}" },
      { actorId: "agent-1", idempotencyKey: "read-fail" },
    );
    expect(read).toMatchObject({
      status: "completed",
      result: {
        error: {
          code: "execution_failed",
          retryable: true,
          details: { code: "tapd_api_error", statusCode: 503 },
        },
      },
    });
    const pending = await pipeline.execute(
      { id: "write-fail", name: "write.example", arguments: "{}" },
      { actorId: "agent-1", idempotencyKey: "write-fail" },
    );
    if (pending.status !== "approval_required")
      throw new Error("expected write approval");
    const write = await pipeline.approve(pending.approval.approvalId);
    expect(write).toMatchObject({
      result: { error: { retryable: false } },
    });
  });
});
