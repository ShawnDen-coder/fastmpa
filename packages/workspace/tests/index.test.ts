import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAttention, markConversationRead } from "../src/attention.js";
import { SqliteWorkspaceRepository } from "../src/repository.js";
import { InMemoryWorkspaceRepository } from "../src/testing.js";
import { sendMessage } from "../src/workspace.js";

describe("workspace", () => {
  it("keeps attention scoped to a workspace and read cursor", () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "TAPD Agent",
      status: "active",
    });
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "b",
      kind: "agent",
      name: "Other Agent",
      status: "active",
    });
    repository.saveConversation({
      id: "conversation-1",
      workspaceId: "a",
      participantIds: ["agent-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    repository.saveConversation({
      id: "conversation-1",
      workspaceId: "b",
      participantIds: ["agent-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    repository.saveMessage({
      id: "message-1",
      workspaceId: "a",
      conversationId: "conversation-1",
      senderId: "human-1",
      body: "@TAPD Agent 检查 7A",
      mentions: ["agent-1"],
      sequence: 1,
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    repository.saveMessage({
      id: "message-2",
      workspaceId: "b",
      conversationId: "conversation-1",
      senderId: "human-2",
      body: "other",
      mentions: ["agent-1"],
      sequence: 1,
      createdAt: "2026-01-01T00:00:01.000Z",
    });

    expect(
      loadAttention(repository, "a", "agent-1").inbox.map(
        (message) => message.id,
      ),
    ).toEqual(["message-1"]);
    markConversationRead(repository, "a", "agent-1", "conversation-1", 1);
    expect(loadAttention(repository, "a", "agent-1").inbox).toEqual([]);
  });

  it("returns assigned cards in agenda and preserves stable order", () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveCard({
      id: "card-2",
      workspaceId: "a",
      boardId: "board",
      columnId: "todo",
      title: "Second",
      assigneeId: "agent-1",
      position: 2,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
    repository.saveCard({
      id: "card-1",
      workspaceId: "a",
      boardId: "board",
      columnId: "todo",
      title: "First",
      assigneeId: "agent-1",
      position: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
    repository.saveCard({
      id: "card-3",
      workspaceId: "a",
      boardId: "board",
      columnId: "todo",
      title: "Other",
      assigneeId: "agent-2",
      position: 0,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    expect(
      loadAttention(repository, "a", "agent-1").agenda.map((card) => card.id),
    ).toEqual(["card-1", "card-2"]);
  });

  it("returns changes from validated workspace writes", () => {
    const repository = new InMemoryWorkspaceRepository();
    repository.saveParticipant({
      id: "human-1",
      workspaceId: "a",
      kind: "human",
      name: "Human",
      status: "active",
    });
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "Agent",
      status: "active",
    });
    repository.saveConversation({
      id: "conversation-1",
      workspaceId: "a",
      participantIds: ["human-1", "agent-1"],
      createdAt: "2026-01-01",
    });

    const result = sendMessage(repository, {
      id: "message-1",
      workspaceId: "a",
      conversationId: "conversation-1",
      senderId: "human-1",
      body: "检查 TAPD",
      mentions: ["agent-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.change).toEqual({
      workspaceId: "a",
      kind: "message.created",
      sourceId: "message-1",
      candidateAgentIds: ["agent-1"],
    });
    expect(() =>
      sendMessage(repository, {
        ...result.message,
        id: "message-2",
        mentions: ["missing"],
        createdAt: "2026-01-01T00:00:01.000Z",
      }),
    ).toThrow("not in workspace");
  });

  it("persists workspace facts across repository instances", () => {
    const directory = mkdtempSync(join(tmpdir(), "fastmpa-workspace-"));
    const databasePath = join(directory, "workspace.sqlite");
    const first = new SqliteWorkspaceRepository(databasePath);
    first.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "TAPD Agent",
      status: "active",
    });
    first.saveConversation({
      id: "conversation-1",
      workspaceId: "a",
      participantIds: ["agent-1"],
      createdAt: "2026-01-01",
    });
    first.saveMessage({
      id: "message-1",
      workspaceId: "a",
      conversationId: "conversation-1",
      senderId: "agent-1",
      body: "检查完成",
      mentions: [],
      sequence: 1,
      createdAt: "2026-01-01",
    });
    first.saveBoard({
      id: "board-1",
      workspaceId: "a",
      name: "任务",
      columnIds: ["todo"],
    });
    first.saveColumn({
      id: "todo",
      workspaceId: "a",
      boardId: "board-1",
      name: "待办",
      position: 0,
    });
    first.saveCard({
      id: "card-1",
      workspaceId: "a",
      boardId: "board-1",
      columnId: "todo",
      title: "7A",
      position: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });
    first.saveSchedule({
      id: "schedule-1",
      workspaceId: "a",
      agentId: "agent-1",
      intervalMs: 60_000,
      nextRunAt: 2,
      instruction: "检查 TAPD",
      createdAt: "2026-01-01",
    });
    first.saveReadCursor({
      workspaceId: "a",
      agentId: "agent-1",
      conversationId: "conversation-1",
      lastSequence: 1,
    });
    first.close();

    const second = new SqliteWorkspaceRepository(databasePath);
    expect(second.getParticipant("a", "agent-1")?.name).toBe("TAPD Agent");
    expect(
      second.listMessages("a", "conversation-1").map((item) => item.id),
    ).toEqual(["message-1"]);
    expect(second.getCard("a", "card-1")?.title).toBe("7A");
    expect(second.listSchedules("a").map((item) => item.id)).toEqual([
      "schedule-1",
    ]);
    expect(
      second.getReadCursor("a", "agent-1", "conversation-1").lastSequence,
    ).toBe(1);
    second.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps SQLite records isolated by workspace", () => {
    const directory = mkdtempSync(join(tmpdir(), "fastmpa-workspace-"));
    const repository = new SqliteWorkspaceRepository(
      join(directory, "workspace.sqlite"),
    );
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "a",
      kind: "agent",
      name: "A",
      status: "active",
    });
    repository.saveParticipant({
      id: "agent-1",
      workspaceId: "b",
      kind: "agent",
      name: "B",
      status: "active",
    });
    expect(repository.getParticipant("a", "agent-1")?.name).toBe("A");
    expect(repository.listParticipants("b").map((item) => item.name)).toEqual([
      "B",
    ]);
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
