import { describe, expect, it } from "vitest";
import { InMemoryWorkspaceRepository } from "workspace/testing";
import { ScheduleRunner } from "../../src/scheduler/schedule.js";
import { AgentScheduler } from "../../src/scheduler/scheduler.js";

describe("agent-scheduler", () => {
  it("deduplicates wakeups per agent and dispatches current attention", async () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "TAPD Agent",
      status: "active",
      agent: {
        persona: "You are the TAPD governance agent.",
        model: "model.tapd",
        toolNames: ["tapd.listRequirements"],
      },
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
      participantIds: ["human-1", "agent-1"],
      createdAt: "2026-01-01",
    });
    repository.saveMessage({
      id: "message-1",
      workspaceId: "a",
      conversationId: "conversation-1",
      senderId: "human-1",
      body: "检查 TAPD 7A",
      mentions: ["agent-1"],
      sequence: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const enqueued: unknown[] = [];
    const scheduler = new AgentScheduler({
      repository,
      runtime: { enqueue: async (input) => enqueued.push(input) },
      createId: () => "wake-1",
      modelKey: "model.default",
      toolsetKey: "tools.tapd.readonly",
    });

    const [signal] = scheduler.notify({
      workspaceId: "a",
      kind: "message.created",
      sourceId: "message-1",
      candidateAgentIds: ["agent-1"],
    });
    expect(scheduler.pendingWake("a", "agent-1")).toEqual(signal);
    expect(
      scheduler.notify({
        workspaceId: "a",
        kind: "message.created",
        sourceId: "message-1",
        candidateAgentIds: ["agent-1"],
      }),
    ).toEqual([signal]);
    await Promise.all([scheduler.dispatch(signal), scheduler.dispatch(signal)]);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      runId: "wake-1",
      turn: {
        messages: [
          {
            role: "system",
            content: expect.stringContaining("TAPD governance agent"),
          },
          { role: "user", content: "检查 TAPD 7A" },
        ],
      },
      dependencies: {
        modelKey: "model.tapd",
        toolsetKey: "tools.tapd.readonly",
      },
      context: {
        agentId: "agent-1",
        workspaceId: "a",
        trigger: "mention",
        sourceRef: { type: "message", id: "message-1" },
      },
    });
    expect(scheduler.pendingWake("a", "agent-1")).toBeUndefined();
  });

  it("advances the read cursor only after a completed run", async () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "Agent",
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
      participantIds: ["human-1", "agent-1"],
      createdAt: "2026-01-01",
    });
    repository.saveMessage({
      id: "message-1",
      workspaceId: "a",
      conversationId: "conversation-1",
      senderId: "human-1",
      body: "处理",
      mentions: ["agent-1"],
      sequence: 1,
      createdAt: "2026-01-01",
    });
    let status: "completed" | "failed" = "failed";
    const scheduler = new AgentScheduler({
      repository,
      runtime: {
        enqueue: async () => undefined,
        run: async () => ({
          runId: "wake-1",
          status,
          attempt: 1,
          version: 1,
          createdAt: "2026-01-01",
        }),
      },
      createId: () => "wake-1",
      modelKey: "model.default",
      toolsetKey: "tools.default",
    });
    const signal = scheduler.notify({
      workspaceId: "a",
      kind: "message.created",
      sourceId: "message-1",
      candidateAgentIds: ["agent-1"],
    })[0];
    await scheduler.dispatchAndRun(signal);
    expect(
      repository.getReadCursor("a", "agent-1", "conversation-1").lastSequence,
    ).toBe(0);
    status = "completed";
    scheduler.notify({
      workspaceId: "a",
      kind: "message.created",
      sourceId: "message-1",
      candidateAgentIds: ["agent-1"],
    });
    await scheduler.dispatchAndRun(signal);
    expect(
      repository.getReadCursor("a", "agent-1", "conversation-1").lastSequence,
    ).toBe(1);
  });

  it("turns a due schedule into a runtime wake without requiring inbox work", async () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "TAPD Agent",
      status: "active",
      agent: {
        model: "model.tapd",
        toolNames: ["tapd.auditRequirementIterations"],
      },
    });
    const enqueued: unknown[] = [];
    const scheduler = new AgentScheduler({
      repository,
      runtime: { enqueue: async (input) => enqueued.push(input) },
      createId: () => "wake-schedule-1",
      modelKey: "model.default",
      toolsetKey: "tools.tapd",
    });
    const runner = new ScheduleRunner({
      scheduler,
      repository,
      dispatch: (signal) => scheduler.dispatch(signal),
    });
    runner.upsert({
      id: "schedule-1",
      workspaceId: "a",
      agentId: "agent-1",
      intervalMs: 60_000,
      nextRunAt: 100,
      instruction: "检查 TAPD 7A 的需求迭代字段。",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const [signal] = await runner.tickAndDispatch(100);
    expect(signal).toMatchObject({
      reason: "schedule",
      sourceRef: { type: "schedule", id: "schedule-1" },
    });
    expect(enqueued[0]).toMatchObject({
      context: {
        trigger: "schedule",
        sourceRef: { type: "schedule", id: "schedule-1" },
      },
    });
    expect(runner.list()[0]?.nextRunAt).toBe(60_100);
  });
});
