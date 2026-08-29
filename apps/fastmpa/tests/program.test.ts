import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ToolRegistry as CoreToolRegistry,
  type ModelAdapter,
} from "@shawnden-coder/agent-core";
import {
  LeaseRuntimeWorker,
  SqliteRunStore,
} from "@shawnden-coder/agent-runtime";
import {
  AgentScheduler,
  ScheduleRunner,
  SqliteWorkClaimStore,
} from "agent-scheduler";
import {
  createRequirementTools,
  MemoryRequirementRepository,
  RequirementService,
} from "apm";
import { createTapdWriteTools } from "integrations";
import {
  SqliteApprovalStore,
  ToolPipeline,
  ToolRegistry,
  toCoreToolRegistry,
} from "tool-pipeline";
import { describe, expect, it } from "vitest";
import {
  assignCard,
  InMemoryWorkspaceRepository,
  sendMessage,
} from "workspace";
import { ApprovalResumer } from "../src/approval-resumer.js";
import { createProgram } from "../src/program.js";
import { createRequirementConversationReporter } from "../src/requirement-reporter.js";
import { createFastMpaHost } from "../src/runtime-host.js";
import {
  createPersistentTapdToolset,
  createTapdReadonlyToolset,
  createTapdToolset,
  MapRuntimeDependencyResolver,
} from "../src/runtime-resolver.js";
import { loadTapdFixture } from "../src/tapd-fixture.js";
import { TapdAuditWorkflow } from "../src/tapd-workflow.js";
import { createWorkspaceReferencePort } from "../src/workspace-refs.js";

describe("createProgram", () => {
  it("resolves persisted model and toolset keys", () => {
    const model = {
      complete: async () => ({ type: "text" as const, content: "ok" }),
    };
    const tools = new CoreToolRegistry();
    const resolver = new MapRuntimeDependencyResolver({
      models: { "model.test": model },
      toolsets: { "tools.test": tools },
    });
    expect(resolver.resolveModel("model.test")).toBe(model);
    expect(resolver.resolveTools("tools.test")).toBe(tools);
    expect(() => resolver.resolveModel("missing")).toThrow(
      "dependency not found",
    );
  });

  it("builds a TAPD Core toolset without write tools", () => {
    const tools = createTapdReadonlyToolset({
      listRequirements: async () => ({ items: [] }),
    });
    expect(tools.get("tapd.auditRequirementIterations")).toBeDefined();
    expect(tools.get("tapd.updateRequirementIteration")).toBeUndefined();
  });

  it("builds a TAPD write toolset only with an explicit Pipeline", () => {
    const pipeline = new ToolPipeline(new ToolRegistry());
    const tools = createTapdToolset(
      {
        listRequirements: async () => ({ items: [] }),
        updateRequirementIteration: async () => ({
          receiptId: "receipt-1",
          requirementId: "r-1",
          iteration: "Sprint 1",
        }),
      },
      { pipeline, actorId: "tapd-agent" },
    );
    expect(tools.get("tapd.auditRequirementIterations")).toBeDefined();
    expect(tools.get("tapd.updateRequirementIteration")).toBeDefined();
  });

  it("lets the Host share the persistent approval store with TAPD tools", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-host-approval-"));
    const approvalStore = new SqliteApprovalStore(
      join(directory, "app.sqlite"),
    );
    const resolver = new MapRuntimeDependencyResolver({
      models: {},
      toolsets: {},
    });
    const host = await createFastMpaHost({
      repository: new InMemoryWorkspaceRepository(),
      databasePath: join(directory, "app.sqlite"),
      ownerId: "worker-1",
      leaseMs: 1_000,
      modelKey: "model",
      toolsetKey: "tools",
      resolver,
      approvalStore,
    });
    expect(host.approvalStore).toBe(approvalStore);
    host.close();
    approvalStore.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("uses a persistent Workspace repository by default", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-host-workspace-"));
    const databasePath = join(directory, "app.sqlite");
    const resolver = new MapRuntimeDependencyResolver({
      models: {},
      toolsets: {},
    });
    const first = await createFastMpaHost({
      databasePath,
      ownerId: "worker-1",
      leaseMs: 1_000,
      modelKey: "model",
      toolsetKey: "tools",
      resolver,
    });
    first.workspaceRepository.saveParticipant({
      id: "agent-1",
      workspaceId: "workspace-1",
      kind: "agent",
      name: "TAPD Agent",
      status: "active",
    });
    first.close();

    const second = await createFastMpaHost({
      databasePath,
      ownerId: "worker-2",
      leaseMs: 1_000,
      modelKey: "model",
      toolsetKey: "tools",
      resolver,
    });
    expect(
      second.workspaceRepository.getParticipant("workspace-1", "agent-1")?.name,
    ).toBe("TAPD Agent");
    second.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("uses the generated binary name", () => {
    expect(createProgram().name()).toBe("fastmpa");
  });

  it("runs the TAPD inspect-report-approve workflow", async () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "TAPD Agent",
      status: "active",
    });
    repository.saveParticipant({
      id: "human-1",
      workspaceId: "a",
      kind: "human",
      name: "Human",
      status: "active",
    });
    repository.saveConversation({
      id: "conversation-1",
      workspaceId: "a",
      participantIds: ["agent-1", "human-1"],
      createdAt: "2026-01-01",
    });
    let updated = false;
    const registry = new ToolRegistry();
    for (const tool of createTapdWriteTools({
      listRequirements: async () => ({ items: [] }),
      updateRequirementIteration: async () => {
        updated = true;
        return {
          receiptId: "receipt-1",
          requirementId: "r-2",
          iteration: "Sprint 1",
        };
      },
    }))
      registry.register(tool);
    const pipeline = new ToolPipeline(registry, undefined, () => "approval-1");
    const workflow = new TapdAuditWorkflow({
      repository,
      client: {
        listRequirements: async () => ({
          items: [
            { id: "r-2", title: "Needs fix", projectId: "7A", iteration: null },
          ],
        }),
      },
      pipeline,
      workspaceId: "a",
      conversationId: "conversation-1",
      agentId: "agent-1",
      createId: (() => {
        let sequence = 0;
        return () => (sequence++ === 0 ? "report-1" : "receipt-1");
      })(),
      now: () => "2026-01-01T00:00:00.000Z",
    });
    const inspected = await workflow.inspect({
      projectId: "7A",
      expectedIteration: "Sprint 1",
    });
    expect(inspected.status).toBe("waiting");
    expect(repository.listMessages("a", "conversation-1")).toHaveLength(1);
    const pending = await workflow.requestUpdate(
      {
        id: "call-1",
        name: "tapd.updateRequirementIteration",
        arguments: JSON.stringify({
          projectId: "7A",
          requirementId: "r-2",
          expectedIteration: null,
          newIteration: "Sprint 1",
        }),
      },
      "update-r-2",
    );
    expect(pending.status).toBe("approval_required");
    if (pending.status !== "approval_required")
      throw new Error("expected approval");
    expect(updated).toBe(false);
    const approved = await workflow.approveUpdate(pending.approval.approvalId);
    expect(approved.status).toBe("completed");
    expect(updated).toBe(true);
    expect(repository.listMessages("a", "conversation-1")).toHaveLength(2);
    expect(repository.listMessages("a", "conversation-1")[1]?.body).toContain(
      "receipt-1",
    );
  });

  it("binds approval to a waiting Run and resumes it", async () => {
    const run = {
      runId: "run-1",
      status: "waiting" as const,
      attempt: 1,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      input: {
        turn: { messages: [{ role: "user" as const, content: "检查 TAPD" }] },
        dependencies: { modelKey: "model", toolsetKey: "tools" },
      },
      error: {
        name: "ToolExecutionError",
        message: "需要确认",
        code: "approval_required",
        details: { approvalId: "approval-1" },
      },
    };
    const store = {
      get: async () => run,
    } as never;
    const pipeline = {
      approve: async (approvalId: string) => ({
        status: "completed" as const,
        result: {
          ok: true as const,
          toolCallId: "call-1",
          name: "tapd.updateRequirementIteration",
          content: `approved:${approvalId}`,
        },
      }),
    } as unknown as ToolPipeline;
    let resumedMessages = 0;
    const worker = {
      resumeRun: async (
        _runId: string,
        turn: { messages: readonly unknown[] },
      ) => {
        resumedMessages = turn.messages.length;
        return { ...run, status: "completed" as const };
      },
    } as never;
    const result = await new ApprovalResumer({
      pipeline,
      store,
      worker,
    }).approveAndResume("run-1", "approval-1");
    expect(result.approval.status).toBe("completed");
    expect(result.run?.status).toBe("completed");
    expect(resumedMessages).toBe(2);
  });

  it("runs the TAPD audit approval path through Core and Runtime", async () => {
    let updateCount = 0;
    const registry = new ToolRegistry();
    for (const tool of createTapdWriteTools({
      listRequirements: async () => ({ items: [] }),
      updateRequirementIteration: async () => {
        updateCount += 1;
        return {
          receiptId: "receipt-1",
          requirementId: "r-2",
          iteration: "Sprint 1",
        };
      },
    }))
      registry.register(tool);
    const pipeline = new ToolPipeline(
      registry,
      undefined,
      () => "approval-e2e",
    );
    let modelCalls = 0;
    const model: ModelAdapter = {
      complete: async () => {
        modelCalls += 1;
        if (modelCalls === 1)
          return {
            type: "tool_calls",
            content: "准备更新 TAPD",
            toolCalls: [
              {
                id: "call-e2e",
                name: "tapd.updateRequirementIteration",
                arguments: JSON.stringify({
                  projectId: "7A",
                  requirementId: "r-2",
                  expectedIteration: null,
                  newIteration: "Sprint 1",
                }),
              },
            ],
          };
        return { type: "text", content: "TAPD 更新完成，回执 receipt-1" };
      },
    };
    const tools = toCoreToolRegistry(registry.list(), {
      pipeline,
      actorId: "tapd-agent",
      idempotencyKeyPrefix: "run-e2e",
    });
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-e2e-"));
    const store = await SqliteRunStore.open({
      filePath: join(directory, "runtime.db"),
      migrationsFolder: false,
    });
    const worker = new LeaseRuntimeWorker(store, {
      ownerId: "worker-e2e",
      leaseMs: 10_000,
      resolver: {
        resolveModel: () => model,
        resolveTools: () => tools,
      },
    });
    await worker.enqueue({
      runId: "run-e2e",
      turn: { messages: [{ role: "user", content: "检查并修正 TAPD 7A" }] },
      dependencies: { modelKey: "model", toolsetKey: "tapd-write" },
    });

    const waiting = await worker.run("run-e2e");
    expect(waiting?.status).toBe("waiting");
    expect(waiting?.error).toMatchObject({
      code: "approval_required",
      details: { approvalId: "approval-e2e" },
    });
    expect(updateCount).toBe(0);

    const resumed = await new ApprovalResumer({
      pipeline,
      store,
      worker,
    }).approveAndResume("run-e2e", "approval-e2e");
    expect(resumed.run?.status).toBe("completed");
    expect(resumed.run?.result?.messages.at(-1)?.content).toContain(
      "TAPD 更新完成",
    );
    expect(updateCount).toBe(1);
    expect(modelCalls).toBe(2);
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("dispatches TAPD Agent work from a message and a due Schedule", async () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "tapd-agent",
      workspaceId: "workspace-1",
      kind: "agent",
      name: "TAPD Agent",
      status: "active",
      agent: {
        persona: "You are the TAPD governance agent.",
        model: "model.tapd",
        toolNames: ["tapd.auditRequirementIterations"],
      },
    });
    repository.saveParticipant({
      id: "human-1",
      workspaceId: "workspace-1",
      kind: "human",
      name: "Human",
      status: "active",
    });
    repository.saveConversation({
      id: "conversation-1",
      workspaceId: "workspace-1",
      participantIds: ["tapd-agent", "human-1"],
      createdAt: "2026-01-01",
    });
    const { change } = sendMessage(repository, {
      id: "message-1",
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      senderId: "human-1",
      body: "检查 TAPD 7A 所有需求单的迭代字段",
      mentions: ["tapd-agent"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const pipeline = new ToolPipeline(new ToolRegistry());
    const tools = createTapdToolset(
      {
        listRequirements: async () => ({ items: [] }),
        updateRequirementIteration: async () => ({
          receiptId: "receipt-unused",
          requirementId: "unused",
          iteration: "Sprint 1",
        }),
      },
      { pipeline, actorId: "tapd-agent" },
    );
    const seenPrompts: string[] = [];
    const model: ModelAdapter = {
      complete: async (input) => {
        seenPrompts.push(input.messages.at(-1)?.content ?? "");
        return { type: "text", content: "已完成检查，未发现异常。" };
      },
    };
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-scheduler-e2e-"));
    const databasePath = join(directory, "runtime.db");
    const runStore = await SqliteRunStore.open({
      filePath: databasePath,
      migrationsFolder: false,
    });
    const claimStore = await SqliteWorkClaimStore.open({
      filePath: databasePath,
      migrationsFolder: false,
    });
    const worker = new LeaseRuntimeWorker(runStore, {
      ownerId: "worker-scheduler-e2e",
      leaseMs: 10_000,
      resolver: {
        resolveModel: () => model,
        resolveTools: () => tools,
      },
    });
    const scheduler = new AgentScheduler({
      repository,
      runtime: worker,
      modelKey: "model.default",
      toolsetKey: "tools.tapd",
      claimStore,
      createId: (() => {
        let sequence = 0;
        return () => `wake-${++sequence}`;
      })(),
    });
    try {
      const messageRun = await scheduler.dispatchAndRun(
        scheduler.notify(change)[0],
      );
      expect(messageRun?.status).toBe("completed");
      expect(
        repository.getReadCursor("workspace-1", "tapd-agent", "conversation-1")
          .lastSequence,
      ).toBe(1);
      expect(seenPrompts[0]).toContain("检查 TAPD 7A");

      repository.saveSchedule({
        id: "schedule-1",
        workspaceId: "workspace-1",
        agentId: "tapd-agent",
        intervalMs: 1_000,
        nextRunAt: 1_000,
        instruction: "每小时检查 TAPD 7A 的迭代字段",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const runner = new ScheduleRunner({
        repository,
        scheduler,
        now: () => 2_500,
        dispatch: (signal) => scheduler.dispatchAndRun(signal),
      });
      const [scheduleSignal] = await runner.tickAndDispatch();
      expect(scheduleSignal?.reason).toBe("schedule");
      const scheduleRun = await runStore.get(scheduleSignal?.wakeId ?? "");
      expect(scheduleRun?.status).toBe("completed");
      expect(seenPrompts[1]).toContain("每小时检查 TAPD 7A");
      expect(
        repository.getSchedule("workspace-1", "schedule-1")?.nextRunAt,
      ).toBe(3_000);
    } finally {
      claimStore.close();
      runStore.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("runs a Card assignment through Scheduler, APM Tool, and approval", async () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "apm-agent",
      workspaceId: "workspace-1",
      kind: "agent",
      name: "APM Agent",
      status: "active",
      agent: { model: "model.apm", toolNames: ["apm.confirmRequirement"] },
    });
    repository.saveParticipant({
      id: "human-1",
      workspaceId: "workspace-1",
      kind: "human",
      name: "Human",
      status: "active",
    });
    repository.saveConversation({
      id: "conversation-1",
      workspaceId: "workspace-1",
      participantIds: ["apm-agent", "human-1"],
      createdAt: "2026-01-01",
    });
    repository.saveBoard({
      id: "board-1",
      workspaceId: "workspace-1",
      name: "Project",
      columnIds: ["column-1"],
    });
    repository.saveCard({
      id: "card-1",
      workspaceId: "workspace-1",
      boardId: "board-1",
      columnId: "column-1",
      title: "Confirm requirement",
      position: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
    const requirementService = new RequirementService(
      new MemoryRequirementRepository(),
      createWorkspaceReferencePort(repository),
    );
    requirementService.create({
      id: "req-1",
      workspaceId: "workspace-1",
      title: "Confirm requirement",
      cardId: "card-1",
      now: "2026-01-01T00:00:00.000Z",
    });
    const pipelineRegistry = new ToolRegistry();
    for (const tool of createRequirementTools(requirementService, {
      now: () => "2026-01-01T00:01:00.000Z",
      createId: () => "evidence-1",
      onChanged: createRequirementConversationReporter({
        repository,
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
        senderId: "apm-agent",
        createId: () => "requirement-change-1",
        now: () => "2026-01-01T00:01:00.000Z",
      }),
    }))
      pipelineRegistry.register(tool);
    const pipeline = new ToolPipeline(
      pipelineRegistry,
      undefined,
      () => "approval-card",
    );
    const tools = toCoreToolRegistry(pipelineRegistry.list(), {
      pipeline,
      actorId: "apm-agent",
      idempotencyKeyPrefix: "run-card",
    });
    let calls = 0;
    const model: ModelAdapter = {
      complete: async () => {
        calls += 1;
        return calls === 1
          ? {
              type: "tool_calls",
              content: "确认需求状态",
              toolCalls: [
                {
                  id: "call-card",
                  name: "apm.confirmRequirement",
                  arguments: JSON.stringify({
                    workspaceId: "workspace-1",
                    requirementId: "req-1",
                    expectedVersion: 0,
                  }),
                },
              ],
            }
          : { type: "text", content: "需求已确认" };
      },
    };
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-apm-e2e-"));
    const runStore = await SqliteRunStore.open({
      filePath: join(directory, "runtime.db"),
      migrationsFolder: false,
    });
    const worker = new LeaseRuntimeWorker(runStore, {
      ownerId: "worker-apm-e2e",
      leaseMs: 10_000,
      resolver: {
        resolveModel: () => model,
        resolveTools: () => tools,
      },
    });
    const scheduler = new AgentScheduler({
      repository,
      runtime: worker,
      modelKey: "model.default",
      toolsetKey: "tools.apm",
      createId: () => "wake-card",
    });
    try {
      const card = repository.getCard("workspace-1", "card-1");
      if (!card) throw new Error("expected test card");
      const change = assignCard(repository, card, "apm-agent");
      const waiting = await scheduler.dispatchAndRun(
        scheduler.notify(change)[0],
      );
      expect(waiting?.status).toBe("waiting");
      expect(requirementService.get("workspace-1", "req-1").status).toBe(
        "needs_clarification",
      );
      const approvalId = waiting?.error?.details as { approvalId: string };
      const resumed = await new ApprovalResumer({
        pipeline,
        store: runStore,
        worker,
      }).approveAndResume("wake-card", approvalId.approvalId);
      expect(resumed.run?.status).toBe("completed");
      expect(requirementService.get("workspace-1", "req-1").status).toBe(
        "confirmed",
      );
      expect(repository.listMessages("workspace-1", "conversation-1")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: expect.stringContaining("当前状态：confirmed"),
          }),
        ]),
      );
    } finally {
      runStore.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("loads the checked-in TAPD fixture with pagination", async () => {
    const client = await loadTapdFixture(
      new URL("../fixtures/tapd.json", import.meta.url),
    );
    const firstPage = await client.listRequirements({
      projectId: "7A",
      page: 1,
      pageSize: 2,
    });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextPage).toBe(2);
  });

  it("assembles and closes the persistent runtime host", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-host-"));
    const host = await createFastMpaHost({
      repository: new InMemoryWorkspaceRepository(),
      databasePath: join(directory, "runtime.db"),
      ownerId: "worker-1",
      leaseMs: 10_000,
      modelKey: "model.default",
      toolsetKey: "tools.default",
      resolver: {
        resolveModel: () => {
          throw new Error("model resolver should not run during assembly");
        },
        resolveTools: () => {
          throw new Error("tool resolver should not run during assembly");
        },
      },
    });
    host.start();
    host.stop();
    host.close();
    await rm(directory, { recursive: true, force: true });
  });
});

describe("persistent TAPD assembly", () => {
  it("keeps TAPD approval available after rebuilding the application wiring", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-tapd-pipeline-"));
    const databasePath = join(directory, "fastmpa.sqlite");
    const client = {
      listRequirements: async () => ({ items: [] }),
      updateRequirementIteration: async (input: {
        requirementId: string;
        newIteration: string;
      }) => ({
        receiptId: "receipt-restart",
        requirementId: input.requirementId,
        iteration: input.newIteration,
      }),
    };
    const first = createPersistentTapdToolset(client, {
      databasePath,
      actorId: "tapd-agent",
      createId: () => "approval-restart",
    });
    const pending = await first.pipeline.execute(
      {
        id: "call-restart",
        name: "tapd.updateRequirementIteration",
        arguments: JSON.stringify({
          projectId: "project-7a",
          requirementId: "requirement-1",
          expectedIteration: "old",
          newIteration: "7A",
        }),
      },
      { actorId: "tapd-agent", idempotencyKey: "update-restart" },
    );
    expect(pending.status).toBe("approval_required");
    first.approvalStore.close();

    const second = createPersistentTapdToolset(client, {
      databasePath,
      actorId: "tapd-agent",
    });
    await expect(
      second.pipeline.approve("approval-restart"),
    ).resolves.toMatchObject({
      status: "completed",
      result: { content: expect.stringContaining("receipt-restart") },
    });
    second.approvalStore.close();
    await rm(directory, { recursive: true, force: true });
  });
});
