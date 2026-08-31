import { describe, expect, it } from "vitest";
import { isApplicationCommand } from "../src/shared/ipc/index.js";

describe("desktop IPC payload guards", () => {
  it("validates command-specific required fields", () => {
    expect(
      isApplicationCommand({
        type: "submit",
        workspaceId: "w",
        conversationId: "c",
        body: "hello",
      }),
    ).toBe(true);
    expect(
      isApplicationCommand({
        type: "submit",
        workspaceId: "w",
        conversationId: "c",
        body: "hello",
        agentId: "legacy-agent",
      }),
    ).toBe(false);
    expect(
      isApplicationCommand({
        type: "submit",
        workspaceId: "w",
        conversationId: "c",
        body: "",
      }),
    ).toBe(false);
    expect(
      isApplicationCommand({
        type: "schedule.create",
        workspaceId: "w",
        agentId: "a",
        instruction: "run",
        intervalMs: 1000,
      }),
    ).toBe(true);
    expect(
      isApplicationCommand({
        type: "schedule.create",
        workspaceId: "w",
        agentId: "a",
        instruction: "run",
        intervalMs: 0,
      }),
    ).toBe(false);
    expect(isApplicationCommand({ type: "unknown" })).toBe(false);
  });
});
