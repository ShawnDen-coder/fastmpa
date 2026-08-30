import { beforeEach, describe, expect, it } from "vitest";
import type { ApplicationEvent } from "../application.js";
import {
  useConversationStore,
  useLogStore,
  useRuntimeStore,
  useShellStore,
} from "./stores.js";

function log(sequence: number) {
  return {
    sequence,
    timestamp: new Date(sequence).toISOString(),
    level: "info" as const,
    component: "test",
    message: `message-${sequence}`,
    context: {},
  };
}

describe("logStore", () => {
  beforeEach(() => useLogStore.setState({ entries: [] }));

  it("keeps at most 500 live entries", () => {
    for (let sequence = 1; sequence <= 501; sequence += 1)
      useLogStore.getState().append(log(sequence));

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(500);
    expect(entries[0]?.sequence).toBe(2);
    expect(entries.at(-1)?.sequence).toBe(501);
  });

  it("merges history with live entries by sequence", () => {
    useLogStore.getState().append(log(3));
    useLogStore.getState().mergeHistory([log(1), log(2), log(3), log(4)]);

    expect(
      useLogStore.getState().entries.map((entry) => entry.sequence),
    ).toEqual([1, 2, 3, 4]);
  });
});

describe("shellStore", () => {
  beforeEach(() =>
    useShellStore.setState({
      page: "Conversations",
      inspectorRunId: undefined,
    }),
  );

  it("keeps inspector selection in shell UI state", () => {
    useShellStore.getState().setInspectorRunId("run-1");
    expect(useShellStore.getState().inspectorRunId).toBe("run-1");
    useShellStore.getState().setInspectorRunId(undefined);
    expect(useShellStore.getState().inspectorRunId).toBeUndefined();
  });
});

describe("conversationStore", () => {
  beforeEach(() =>
    useConversationStore.setState({
      drafts: {},
      failedMessages: {},
      sendQueues: {},
    }),
  );

  it("keeps queued messages isolated by conversation key", () => {
    const store = useConversationStore.getState();
    store.enqueue("workspace-a:conversation-a", "first");
    store.enqueue("workspace-b:conversation-b", "second");

    expect(useConversationStore.getState().sendQueues).toEqual({
      "workspace-a:conversation-a": ["first"],
      "workspace-b:conversation-b": ["second"],
    });
    useConversationStore.getState().dequeue("workspace-a:conversation-a");
    expect(
      useConversationStore.getState().sendQueues["workspace-b:conversation-b"],
    ).toEqual(["second"]);
  });

  it("keeps failed messages isolated and removable", () => {
    useConversationStore
      .getState()
      .setFailedMessage("workspace-a:conversation-a", "retry me");
    expect(
      useConversationStore.getState().failedMessages[
        "workspace-a:conversation-a"
      ],
    ).toBe("retry me");
    useConversationStore
      .getState()
      .clearFailedMessage("workspace-a:conversation-a");
    expect(useConversationStore.getState().failedMessages).toEqual({});
  });
});

describe("runtimeStore", () => {
  beforeEach(() =>
    useRuntimeStore.setState({ events: [], streamingByConversation: {} }),
  );

  it("caps live events and keeps streaming text by conversation", () => {
    const store = useRuntimeStore.getState();
    const event = {
      type: "tool.started",
      toolCallId: "tool-1",
      toolName: "demo",
      runId: "run-1",
      attempt: 1,
    } as ApplicationEvent;
    for (let index = 0; index < 201; index += 1)
      store.appendEvent({
        ...event,
        toolCallId: `tool-${index}`,
      } as ApplicationEvent);
    store.appendTextDelta("workspace:conversation", "Hello");
    store.appendTextDelta("workspace:conversation", " world");

    expect(useRuntimeStore.getState().events).toHaveLength(200);
    expect(
      useRuntimeStore.getState().streamingByConversation[
        "workspace:conversation"
      ],
    ).toBe("Hello world");
    store.clearStreaming("workspace:conversation");
    expect(
      useRuntimeStore.getState().streamingByConversation[
        "workspace:conversation"
      ],
    ).toBeUndefined();
  });
});
