import { describe, expect, it } from "vitest";
import { isApplicationCommand, isSnapshotQuery } from "../src/shared/ipc.js";

describe("desktop IPC payload guards", () => {
  it("accepts supported snapshot queries and rejects unknown shapes", () => {
    expect(isSnapshotQuery(undefined)).toBe(true);
    expect(isSnapshotQuery({ workspaceId: "workspace-1" })).toBe(true);
    expect(isSnapshotQuery({ workspaceId: 42 })).toBe(false);
    expect(isSnapshotQuery({ unexpected: true })).toBe(false);
  });

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
