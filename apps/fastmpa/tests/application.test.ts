import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  DefaultRuntimeTooling,
  ToolCatalog,
  ToolPipeline,
} from "@shawnden-coder/agent-runtime";
import { describe, expect, it } from "vitest";
import {
  createApplication,
  selectConversationContext,
} from "../src/application/application.js";

describe("FastMpaApplication", () => {
  it("validates Agent configuration, publishes Agent changes, and protects group invariants", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    const snapshots: unknown[] = [];
    app.subscribe((snapshot) => snapshots.push(snapshot));
    await app.start();
    await expect(
      app.dispatch({
        type: "agent.create",
        workspaceId: "default",
        input: {
          name: "Researcher",
          modelKey: "missing-model",
          persona: "Research",
          role: "researcher",
          capabilities: ["research"],
          toolNames: [],
        },
      }),
    ).rejects.toThrow("Unknown model");
    const created = await app.dispatch({
      type: "agent.create",
      workspaceId: "default",
      input: {
        name: "Researcher",
        modelKey: "demo",
        persona: "Research",
        role: "researcher",
        capabilities: ["research"],
        toolNames: [],
      },
    });
    expect(created.participant?.name).toBe("Researcher");
    expect(snapshots.length).toBeGreaterThan(0);
    const second = await app.dispatch({
      type: "agent.create",
      workspaceId: "default",
      input: {
        name: "Writer",
        modelKey: "demo",
        persona: "Write",
        role: "writer",
        capabilities: ["writing"],
        toolNames: [],
      },
    });
    const direct = await app.dispatch({
      type: "conversation.direct.open",
      workspaceId: "default",
      agentId: created.participant?.id ?? "",
    });
    await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: direct.conversationId ?? "",
      agentId: second.participant?.id,
      body: "Keep direct membership stable",
    });
    expect(
      (
        await app.getSnapshot({
          workspaceId: "default",
          conversationId: direct.conversationId,
        })
      ).conversations[0]?.participantIds,
    ).toEqual(["human", created.participant?.id]);
    const group = await app.dispatch({
      type: "conversation.group.create",
      workspaceId: "default",
      title: "Solo group",
      agentIds: [created.participant?.id ?? ""],
    });
    await expect(
      app.dispatch({
        type: "agent.archive",
        workspaceId: "default",
        agentId: created.participant?.id ?? "",
      }),
    ).rejects.toThrow("only Agent");
    expect(group.conversationId).toBeTruthy();
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }, 20_000);

  it("publishes scoped snapshot invalidations for conversation work", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    const invalidations: string[] = [];
    app.subscribeSnapshotInvalidated((scope) =>
      invalidations.push(scope.scope),
    );
    await app.start();
    await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "invalidations",
      body: "refresh me",
    });
    expect(invalidations).toContain("conversation");
    expect(invalidations).toContain("dispatch");
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }, 20_000);

  it("serves scoped Shell, Conversation, Dispatch, and Run snapshots", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    await app.start();
    const result = await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "scoped",
      body: "scoped query",
    });
    const runId = result.run?.runId ?? "";
    const shell = await app.getShellSnapshot();
    expect(shell.conversations).toContainEqual(
      expect.objectContaining({
        id: "scoped",
        lastMessagePreview: expect.any(String),
      }),
    );
    const summary = (
      await app.getSnapshot({ workspaceId: "default" })
    ).conversations.find((item) => item.id === "scoped");
    expect(summary?.lastMessagePreview).toBeTruthy();
    const conversation = await app.getConversationSnapshot({
      workspaceId: "default",
      conversationId: "scoped",
    });
    expect(conversation.messages.map((item) => item.body)).toContain(
      "scoped query",
    );
    const dispatch = await app.getDispatchSnapshot(
      `dispatch:${result.run?.context?.sourceRef?.id}`,
    );
    expect(dispatch.status).toBe("completed");
    const run = await app.getRunSnapshot(runId);
    expect(run.run?.runId).toBe(runId);
    expect(run.dispatch?.id).toBe(dispatch.id);
    expect(run.events.length).toBeGreaterThan(0);
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }, 20_000);

  it("tracks an approval-waiting child Run and completes its Dispatch after approval", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const catalog = new ToolCatalog();
    catalog.register({
      definition: {
        name: "write.example",
        description: "Write",
        parameters: {},
      },
      effect: "write",
      execute: async () => "approved result",
    });
    const tooling = new DefaultRuntimeTooling(
      catalog,
      new ToolPipeline(catalog),
    );
    const model = {
      complete: async (input: {
        messages: readonly { role: string; content: string }[];
      }) => {
        if (input.messages.some((message) => message.role === "tool"))
          return { type: "text" as const, content: "completed after approval" };
        return {
          type: "tool_calls" as const,
          content: "",
          toolCalls: [{ id: "call-1", name: "write.example", arguments: "{}" }],
        };
      },
    };
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
      model,
      tooling,
    });
    await app.start();
    await app.dispatch({
      type: "agent.create",
      workspaceId: "default",
      input: {
        id: "writer",
        name: "Writer",
        modelKey: "demo",
        persona: "writer",
        role: "writer",
        capabilities: [],
        toolNames: ["write.example"],
      },
    });
    const group = await app.dispatch({
      type: "conversation.group.create",
      workspaceId: "default",
      title: "Approval",
      agentIds: ["writer"],
    });
    const pending = app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: group.conversationId ?? "",
      body: "@Writer write this",
    });
    let waitingRun:
      | Awaited<ReturnType<typeof app.getSnapshot>>["runs"][number]
      | undefined;
    for (let attempt = 0; attempt < 100 && !waitingRun; attempt += 1) {
      waitingRun = (await app.getSnapshot()).runs.find(
        (run) => run.status === "waiting",
      );
      if (!waitingRun) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waitingRun?.error?.details).toEqual(
      expect.objectContaining({ approvalId: expect.any(String) }),
    );
    if (!waitingRun)
      throw new Error("Run did not enter approval waiting state");
    if (!waitingRun.error) throw new Error("Approval error is missing");
    const approvalId = (waitingRun.error.details as { approvalId: string })
      .approvalId;
    await app.dispatch({
      type: "approve",
      runId: waitingRun?.runId ?? "",
      approvalId,
    });
    const result = await pending;
    expect(result.run?.status).toBe("completed");
    expect((await app.getSnapshot()).dispatches[0]?.status).toBe("completed");
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }, 20_000);

  it("keeps successful replies and marks a mixed Dispatch partial", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const model = {
      complete: async (input: {
        messages: readonly { role: string; content: string }[];
      }) => {
        if (input.messages[0]?.content.includes("fail"))
          throw new Error("Agent failed");
        return { type: "text" as const, content: "successful reply" };
      },
    };
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
      model,
    });
    await app.start();
    for (const [id, name, persona] of [
      ["research", "Research", "success"],
      ["writer", "Writer", "fail"],
    ] as const)
      await app.dispatch({
        type: "agent.create",
        workspaceId: "default",
        input: {
          id,
          name,
          modelKey: "demo",
          persona,
          role: name,
          capabilities: [],
          toolNames: [],
        },
      });
    const group = await app.dispatch({
      type: "conversation.group.create",
      workspaceId: "default",
      title: "Partial",
      agentIds: ["research", "writer"],
    });
    const result = await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: group.conversationId ?? "",
      body: "@Research @Writer collaborate",
    });
    expect(result.runs).toHaveLength(2);
    const snapshot = await app.getSnapshot({
      workspaceId: "default",
      conversationId: group.conversationId,
    });
    expect(snapshot.dispatches[0]?.status).toBe("partial");
    expect(
      snapshot.messages.filter((message) => message.senderId === "research"),
    ).toHaveLength(1);
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }, 20_000);

  it("routes a group message to multiple Agents with deterministic Run IDs", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const model = {
      complete: async (input: {
        messages: readonly { role: string; content: string }[];
      }) => {
        if (
          input.messages[0]?.content.includes("You route a workspace message")
        )
          return {
            type: "text" as const,
            content: JSON.stringify({
              assignments: [
                { agentId: "research", instruction: "verify", reason: "facts" },
                {
                  agentId: "writer",
                  instruction: "draft",
                  reason: "presentation",
                },
              ],
            }),
          };
        return {
          type: "text" as const,
          content: `reply-${input.messages.at(-1)?.content}`,
        };
      },
    };
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
      model,
    });
    await app.start();
    for (const [id, name] of [
      ["research", "Research"],
      ["writer", "Writer"],
    ] as const)
      await app.dispatch({
        type: "agent.create",
        workspaceId: "default",
        input: {
          id,
          name,
          modelKey: "demo",
          persona: "helpful",
          role: name,
          capabilities: [name.toLocaleLowerCase()],
          toolNames: [],
        },
      });
    const group = await app.dispatch({
      type: "conversation.group.create",
      workspaceId: "default",
      title: "Project",
      agentIds: ["research", "writer"],
    });
    const result = await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: group.conversationId ?? "",
      body: "Please collaborate",
    });
    expect(result.runs).toHaveLength(2);
    expect(result.runs?.map((run) => run.runId).sort()).toEqual(
      [
        `run:${result.runs?.[0]?.context?.sourceRef?.id}:research`,
        `run:${result.runs?.[0]?.context?.sourceRef?.id}:writer`,
      ].sort(),
    );
    const snapshot = await app.getSnapshot({
      workspaceId: "default",
      conversationId: group.conversationId,
    });
    expect(
      snapshot.messages.filter((message) => message.senderId !== "human"),
    ).toHaveLength(2);
    expect(snapshot.dispatches).toEqual([
      expect.objectContaining({
        id: `dispatch:${result.runs?.[0]?.context?.sourceRef?.id}`,
        status: "completed",
        assignments: expect.arrayContaining([
          expect.objectContaining({ agentId: "research", status: "completed" }),
          expect.objectContaining({ agentId: "writer", status: "completed" }),
        ]),
      }),
    ]);
    await app.stop();
    const restored = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    await restored.start();
    expect(
      (
        await restored.getSnapshot({
          workspaceId: "default",
          conversationId: group.conversationId,
        })
      ).dispatches,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "completed" }),
      ]),
    );
    await restored.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it("creates agents and enforces one direct conversation per agent", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    await app.start();
    const agent = await app.dispatch({
      type: "agent.create",
      workspaceId: "default",
      input: {
        name: "Researcher",
        modelKey: "demo",
        persona: "precise",
        role: "research",
        capabilities: ["search"],
        toolNames: [],
      },
    });
    expect(agent.participant?.kind).toBe("agent");
    const first = await app.dispatch({
      type: "conversation.direct.open",
      workspaceId: "default",
      agentId: agent.participant?.id ?? "",
    });
    const second = await app.dispatch({
      type: "conversation.direct.open",
      workspaceId: "default",
      agentId: agent.participant?.id ?? "",
    });
    expect(first.created).toBe(true);
    expect(second).toEqual({
      conversationId: first.conversationId,
      created: false,
    });
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }, 20_000);

  it("publishes live streaming events enriched with run context", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const events: string[] = [];
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
      model: {
        complete: async () => ({ type: "text" as const, content: "fallback" }),
        async *stream() {
          yield { type: "text.delta" as const, delta: "实时" };
          yield { type: "text.delta" as const, delta: "回复" };
        },
      },
    });
    app.subscribeEvents((event) => {
      if (event.type === "text.delta")
        events.push(`${event.runId}:${event.delta}`);
    });
    await app.start();
    const result = await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "default",
      body: "流式测试",
    });

    expect(result.run?.status).toBe("completed");
    expect(events).toEqual([
      `${result.run?.runId}:实时`,
      `${result.run?.runId}:回复`,
    ]);
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it("supports a persistent workspace conversation across switching and restart", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const databasePath = join(directory, "state.sqlite");
    const first = await createApplication({ databasePath });
    await first.start();
    await first.dispatch({
      type: "workspace.create",
      workspaceId: "project-a",
      name: "Project A",
    });
    await first.dispatch({
      type: "conversation.create",
      workspaceId: "project-a",
      conversationId: "conversation-a",
      title: "Daily work",
    });
    for (const body of ["one", "two", "three"])
      await first.dispatch({
        type: "submit",
        workspaceId: "project-a",
        conversationId: "conversation-a",
        body,
      });
    const selected = await first.getSnapshot({
      workspaceId: "project-a",
      conversationId: "conversation-a",
    });
    expect(
      selected.messages.filter((item) => item.senderId === "human"),
    ).toHaveLength(3);
    expect(selected.runs).toHaveLength(3);
    expect(
      (await first.getSnapshot({ workspaceId: "default" })).messages,
    ).toEqual([]);
    await first.stop();

    const second = await createApplication({ databasePath });
    await second.start();
    const restored = await second.getSnapshot({
      workspaceId: "project-a",
      conversationId: "conversation-a",
    });
    expect(restored.workspaces).toContainEqual(
      expect.objectContaining({ id: "project-a", name: "Project A" }),
    );
    expect(restored.messages.map((item) => item.body)).toContain("three");
    await second.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it("trims model context to the latest complete user/assistant boundary", () => {
    const messages = Array.from({ length: 52 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: String(index),
    }));
    expect(selectConversationContext(messages, 50)).toHaveLength(50);
    expect(selectConversationContext(messages, 50)[0]).toEqual({
      role: "user",
      content: "2",
    });
    expect(selectConversationContext(messages, 50).at(-1)?.content).toBe("51");
  });

  it("creates, renames, and filters workspace snapshots", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    await app.start();
    await app.dispatch({
      type: "workspace.create",
      workspaceId: "project-a",
      name: "Project A",
    });
    await app.dispatch({
      type: "workspace.rename",
      workspaceId: "project-a",
      name: "Renamed Project",
    });
    const snapshot = await app.getSnapshot({ workspaceId: "project-a" });
    expect(snapshot.selectedWorkspaceId).toBe("project-a");
    expect(snapshot.workspaces).toContainEqual(
      expect.objectContaining({ id: "project-a", name: "Renamed Project" }),
    );
    await expect(
      app.dispatch({
        type: "conversation.create",
        workspaceId: "missing",
        conversationId: "conversation-1",
      }),
    ).rejects.toThrow("Workspace not found");
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it("persists validated schedules and supports pause, resume, and delete", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    await app.start();
    const agent = await app.dispatch({
      type: "agent.create",
      workspaceId: "default",
      input: {
        name: "Scheduler",
        modelKey: "demo",
        persona: "Schedule tasks",
        role: "operator",
        capabilities: ["automation"],
        toolNames: [],
      },
    });
    await expect(
      app.dispatch({
        type: "schedule.create",
        workspaceId: "default",
        agentId: agent.participant?.id ?? "",
        instruction: "too soon",
        intervalMs: 1,
      }),
    ).rejects.toThrow("at least one minute");
    await app.dispatch({
      type: "schedule.create",
      workspaceId: "default",
      agentId: agent.participant?.id ?? "",
      instruction: "Review tasks",
      intervalMs: 60_000,
      scheduleId: "schedule-1",
    });
    expect(
      (await app.getSnapshot({ workspaceId: "default" })).schedules,
    ).toContainEqual(
      expect.objectContaining({ id: "schedule-1", enabled: true }),
    );
    await app.dispatch({
      type: "schedule.pause",
      workspaceId: "default",
      scheduleId: "schedule-1",
    });
    await app.dispatch({
      type: "schedule.resume",
      workspaceId: "default",
      scheduleId: "schedule-1",
    });
    await app.dispatch({
      type: "schedule.delete",
      workspaceId: "default",
      scheduleId: "schedule-1",
    });
    expect(
      (await app.getSnapshot({ workspaceId: "default" })).schedules,
    ).not.toContainEqual(expect.objectContaining({ id: "schedule-1" }));
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }, 20_000);

  it("persists a submitted task, run, and assistant reply", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
    });
    await app.start();
    const result = await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "default",
      body: "整理今天的任务",
    });
    const snapshot = await app.getSnapshot();
    expect(result.created).toBe(true);
    expect(result.run?.status).toBe("completed");
    expect(snapshot.messages.map((message) => message.body)).toContain(
      "整理今天的任务",
    );
    expect(snapshot.runs).toHaveLength(1);
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps identical message text idempotent per message and replays once", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const databasePath = join(directory, "state.sqlite");
    const first = await createApplication({ databasePath });
    await first.start();
    await first.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "default",
      body: "重复文本",
    });
    await first.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "default",
      body: "重复文本",
    });
    await first.stop();

    const second = await createApplication({ databasePath });
    await second.start();
    const snapshot = await second.getSnapshot();
    expect(snapshot.runs).toHaveLength(2);
    expect(
      snapshot.messages.filter((message) => message.senderId === "demo-agent"),
    ).toHaveLength(2);
    await second.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it("passes the existing conversation history into the next turn", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-test-"));
    const inputs: { role: string; content: string }[][] = [];
    const model = {
      complete: async (input: {
        messages: readonly { role: string; content: string }[];
      }) => {
        inputs.push([...input.messages]);
        return { type: "text" as const, content: `reply-${inputs.length}` };
      },
    };
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
      model,
    });
    await app.start();
    await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "default",
      body: "第一轮",
    });
    await app.dispatch({
      type: "submit",
      workspaceId: "default",
      conversationId: "default",
      body: "第二轮",
    });
    expect(inputs[1]).toEqual([
      { role: "system", content: "Helpful local Agent" },
      { role: "user", content: "第一轮" },
      { role: "assistant", content: "reply-1" },
      { role: "user", content: "第二轮" },
    ]);
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
});
