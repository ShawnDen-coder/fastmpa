import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApplication } from "../../src/application/application.js";

const model = {
  complete: async () => ({
    type: "text" as const,
    content: "ok",
  }),
};

function agentInput(name: string) {
  return {
    name,
    modelKey: "default",
    persona: "Helpful",
    role: "assistant",
    capabilities: ["general"],
    toolNames: [],
  };
}

describe("workspace-scoped shell and conversation routing", () => {
  it("marks an unavailable default model and refuses invalid Agent creation", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-model-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
      modelConfigured: false,
    });
    await app.start();
    expect(app.getShellSnapshot).toBeTypeOf("function");
    const snapshot = await app.getShellSnapshot({ workspaceId: "default" });
    expect(snapshot.models).toContainEqual(
      expect.objectContaining({
        key: "default",
        configured: false,
      }),
    );
    await expect(
      app.dispatch({
        type: "agent.create",
        workspaceId: "default",
        input: agentInput("Unavailable"),
      }),
    ).rejects.toThrow("Model is not configured");
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  });

  it("returns only the requested workspace and its model catalog", async () => {
    const directory = await mkdtemp(join(process.cwd(), "fastmpa-scope-"));
    const app = await createApplication({
      databasePath: join(directory, "state.sqlite"),
      model,
    });
    await app.start();
    await app.dispatch({
      type: "workspace.create",
      workspaceId: "workspace-b",
      name: "Workspace B",
    });
    const first = await app.dispatch({
      type: "agent.create",
      workspaceId: "default",
      input: agentInput("Default Agent"),
    });
    const second = await app.dispatch({
      type: "agent.create",
      workspaceId: "workspace-b",
      input: agentInput("Second Agent"),
    });
    await app.dispatch({
      type: "conversation.direct.open",
      workspaceId: "default",
      agentId: first.participant?.id ?? "",
    });
    await app.dispatch({
      type: "conversation.direct.open",
      workspaceId: "workspace-b",
      agentId: second.participant?.id ?? "",
    });

    const snapshot = await app.getShellSnapshot({ workspaceId: "workspace-b" });
    expect(snapshot.workspaceId).toBe("workspace-b");
    expect(snapshot.participants.map((item) => item.name).sort()).toEqual([
      "Second Agent",
      "You",
    ]);
    expect(
      snapshot.conversations.every(
        (item) => item.workspaceId === "workspace-b",
      ),
    ).toBe(true);
    expect(snapshot.models.map((item) => item.key)).toEqual(["default"]);

    await expect(
      app.dispatch({
        type: "submit",
        workspaceId: "workspace-b",
        conversationId: "missing",
        body: "must fail",
      }),
    ).rejects.toThrow("Conversation not found");
    const firstStop = app.stop();
    expect(app.stop()).toBe(firstStop);
    await firstStop;
    await rm(directory, { recursive: true, force: true });
  });
});
