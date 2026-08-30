import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApplication } from "../src/application.js";

describe("FastMpaApplication", () => {
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
});
