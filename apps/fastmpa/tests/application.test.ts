import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createApplication,
  selectConversationContext,
} from "../src/application.js";

describe("FastMpaApplication", () => {
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
      { role: "user", content: "第一轮" },
      { role: "assistant", content: "reply-1" },
      { role: "user", content: "第二轮" },
    ]);
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
});
