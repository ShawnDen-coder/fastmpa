import { beforeEach, describe, expect, it } from "vitest";
import { shouldSubmitOnEnter } from "../../src/renderer/features/conversations/composer-policy.js";
import {
  useConversationStore,
  useLogStore,
  useRuntimeStore,
  useShellStore,
} from "../../src/renderer/stores/index.js";
import type { ApplicationEvent } from "../../src/shared/contracts/application.js";

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
  beforeEach(() =>
    useLogStore.setState({
      entries: [],
      level: "all",
      workspaceId: "all",
      conversationId: "all",
      runId: "all",
      component: "all",
      followLatest: true,
    }),
  );
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
  it("merges a batched log payload in one ordered ring-buffer update", () => {
    useLogStore.getState().mergeEntries([log(3), log(1), log(2)]);
    expect(
      useLogStore.getState().entries.map((entry) => entry.sequence),
    ).toEqual([1, 2, 3]);
  });
  it("persists log filters and follow-latest state in the store", () => {
    const store = useLogStore.getState();
    store.setLevel("warn");
    store.setWorkspaceId("workspace-a");
    store.setConversationId("conversation-a");
    store.setRunId("run-a");
    store.setComponent("runtime");
    store.setFollowLatest(false);
    expect(useLogStore.getState()).toMatchObject({
      level: "warn",
      workspaceId: "workspace-a",
      conversationId: "conversation-a",
      runId: "run-a",
      component: "runtime",
      followLatest: false,
    });
  });
});

describe("shellStore", () => {
  beforeEach(() =>
    useShellStore.setState({
      page: "Conversations",
      inspectorRunId: undefined,
      conversationListWidth: 320,
    }),
  );
  it("keeps inspector selection in shell UI state", () => {
    useShellStore.getState().setInspectorRunId("run-1");
    expect(useShellStore.getState().inspectorRunId).toBe("run-1");
    useShellStore.getState().setInspectorRunId(undefined);
    expect(useShellStore.getState().inspectorRunId).toBeUndefined();
  });
  it("clamps the resizable conversation list to the supported range", () => {
    useShellStore.getState().setConversationListWidth(100);
    expect(useShellStore.getState().conversationListWidth).toBe(240);
    useShellStore.getState().setConversationListWidth(700);
    expect(useShellStore.getState().conversationListWidth).toBe(520);
  });
});

describe("conversationStore", () => {
  beforeEach(() =>
    useConversationStore.setState({
      snapshots: {},
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
    useRuntimeStore.setState({
      snapshots: {},
      events: [],
      streamingByConversation: {},
      persistedEventsByConversation: {},
    }),
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

  it("merges a batched delta sequence in one conversation-scoped state", () => {
    useRuntimeStore.getState().mergeEvents([
      {
        type: "text.delta",
        delta: "one",
        runId: "run-1",
        attempt: 1,
        context: { workspaceId: "w", conversationId: "c" },
      } as ApplicationEvent,
      {
        type: "text.delta",
        delta: " two",
        runId: "run-1",
        attempt: 1,
        context: { workspaceId: "w", conversationId: "c" },
      } as ApplicationEvent,
      {
        type: "turn.completed",
        runId: "run-1",
        attempt: 1,
        context: { workspaceId: "w", conversationId: "c" },
      } as ApplicationEvent,
    ]);
    expect(useRuntimeStore.getState().events).toHaveLength(3);
    expect(
      useRuntimeStore.getState().streamingByConversation["w:c"],
    ).toBeUndefined();
  });
});

describe("composer policy", () => {
  it("does not submit during IME composition and preserves Shift+Enter", () => {
    expect(
      shouldSubmitOnEnter({ key: "Enter", shiftKey: false, isComposing: true }),
    ).toBe(false);
    expect(
      shouldSubmitOnEnter({ key: "Enter", shiftKey: true, isComposing: false }),
    ).toBe(false);
    expect(
      shouldSubmitOnEnter({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
      }),
    ).toBe(true);
  });
});

describe("renderer performance envelope", () => {
  it("merges a 100-conversation workspace without growing live buffers unboundedly", () => {
    useRuntimeStore.setState({
      snapshots: {},
      events: [],
      streamingByConversation: {},
      persistedEventsByConversation: {},
    });
    const conversations = Array.from(
      { length: 100 },
      (_, conversationIndex) => ({
        id: `conversation-${conversationIndex}`,
        workspaceId: "workspace",
        kind: "group" as const,
        title: `Conversation ${conversationIndex}`,
        participantIds: ["human"],
        createdAt: new Date(0).toISOString(),
      }),
    );
    const messages = conversations.flatMap((conversation) =>
      Array.from({ length: 500 }, (_, sequence) => ({
        id: `${conversation.id}-${sequence}`,
        workspaceId: "workspace",
        conversationId: conversation.id,
        senderId: "human",
        body: `message-${sequence}`,
        mentions: [],
        sequence,
        createdAt: new Date(sequence).toISOString(),
      })),
    );
    useShellStore.setState({
      snapshot: {
        workspaces: [],
        selectedWorkspaceId: "workspace",
        conversations,
        participants: [],
        schedules: [],
        dispatches: [],
      },
    });
    useConversationStore.getState().setSnapshot(
      { workspaceId: "workspace", conversationId: "conversation-42" },
      {
        conversation: conversations[42],
        messages: messages.filter(
          (message) => message.conversationId === "conversation-42",
        ),
        runs: [],
        dispatches: [],
        events: [],
      },
    );
    expect(
      useConversationStore
        .getState()
        .snapshots["workspace:conversation-42"]?.messages.filter(
          (message) => message.conversationId === "conversation-42",
        ),
    ).toHaveLength(500);
    for (let batch = 0; batch < 100; batch += 1)
      useRuntimeStore.getState().mergeEvents([
        {
          type: "text.delta",
          delta: "x",
          runId: `run-${batch}`,
          attempt: 1,
          context: {
            workspaceId: "workspace",
            conversationId: "conversation-42",
          },
        } as ApplicationEvent,
      ]);
    expect(useRuntimeStore.getState().events).toHaveLength(100);
  });
});
