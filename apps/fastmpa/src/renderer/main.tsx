import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import remarkGfm from "remark-gfm";
import type { ApplicationEvent } from "../application.js";
import { PageView } from "./page-view.js";
import {
  useApplicationStore,
  useConversationStore,
  useLogStore,
  useRuntimeStore,
  useSelectionStore,
  useShellStore,
} from "./stores.js";
import "./styles.css";

const pages = [
  "Conversations",
  "Agents",
  "Runs",
  "Schedules",
  "Logs",
  "Settings",
];

function runDuration(run: {
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}): string {
  const start = Date.parse(run.startedAt ?? run.createdAt);
  const end = Date.parse(run.finishedAt ?? new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return "—";
  return `${Math.round((end - start) / 1000)}s`;
}

function MarkdownPre({
  children,
}: {
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const text = typeof children === "string" ? children.replace(/\n$/, "") : "";
  return (
    <pre className="markdown-pre">
      <button
        type="button"
        className="copy-code-button"
        onClick={() => void navigator.clipboard.writeText(text)}
      >
        Copy
      </button>
      {children}
    </pre>
  );
}

function ToolEventCard({
  event,
  onDetails,
}: {
  readonly event: ApplicationEvent;
  readonly onDetails: (runId: string) => void;
}): React.JSX.Element | null {
  const [action, setAction] = useState<"approve" | "reject" | "details">(
    "approve",
  );
  if (event.type === "tool.started") {
    return (
      <div className="tool-card">
        <span>Tool</span>
        <strong>{event.toolName}</strong>
        <small>Running</small>
      </div>
    );
  }
  if (event.type === "tool.completed") {
    return (
      <div className="tool-card">
        <span>Tool</span>
        <strong>{event.toolCallId.slice(0, 8)}</strong>
        <small>{event.isError ? "Failed" : "Completed"}</small>
      </div>
    );
  }
  if (event.type !== "tool.approval_required") return null;
  const approvalEvent = event;
  function execute(): void {
    if (action === "details") {
      onDetails(approvalEvent.runId);
      return;
    }
    void window.fastMpa.application.dispatch({
      type: action,
      runId: approvalEvent.runId,
      approvalId: approvalEvent.approvalId,
    });
  }
  return (
    <fieldset
      className="tool-card approval-inline"
      aria-label="Tool approval"
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.ctrlKey && keyboardEvent.key.toLowerCase() === "a") {
          keyboardEvent.preventDefault();
          setAction("approve");
        } else if (
          keyboardEvent.ctrlKey &&
          keyboardEvent.key.toLowerCase() === "x"
        ) {
          keyboardEvent.preventDefault();
          setAction("reject");
        } else if (keyboardEvent.key === "ArrowLeft") {
          setAction((current) =>
            current === "approve"
              ? "details"
              : current === "reject"
                ? "approve"
                : "reject",
          );
        } else if (keyboardEvent.key === "ArrowRight") {
          setAction((current) =>
            current === "approve"
              ? "reject"
              : current === "reject"
                ? "details"
                : "approve",
          );
        } else if (keyboardEvent.key === "Enter") {
          keyboardEvent.preventDefault();
          execute();
        }
      }}
    >
      <span>Approval required</span>
      <strong>{event.toolCallId.slice(0, 8)}</strong>
      <small>Review this tool call before the run can continue.</small>
      <div className="run-actions">
        <button
          type="button"
          className={
            action === "approve" ? "approve-button selected" : "approve-button"
          }
          onClick={() => {
            setAction("approve");
            void window.fastMpa.application.dispatch({
              type: "approve",
              runId: approvalEvent.runId,
              approvalId: approvalEvent.approvalId,
            });
          }}
        >
          Approve
        </button>
        <button
          type="button"
          className={
            action === "reject" ? "reject-button selected" : "reject-button"
          }
          onClick={() => {
            setAction("reject");
            void window.fastMpa.application.dispatch({
              type: "reject",
              runId: approvalEvent.runId,
              approvalId: approvalEvent.approvalId,
            });
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className={
            action === "details"
              ? "secondary-button selected"
              : "secondary-button"
          }
          onClick={() => {
            setAction("details");
            onDetails(event.runId);
          }}
        >
          Details
        </button>
      </div>
    </fieldset>
  );
}

function App(): React.JSX.Element {
  const snapshot = useApplicationStore((state) => state.snapshot);
  const setSnapshot = useApplicationStore((state) => state.setSnapshot);
  const desktopInfo = useApplicationStore((state) => state.desktopInfo);
  const setDesktopInfo = useApplicationStore((state) => state.setDesktopInfo);
  const closing = useApplicationStore((state) => state.closing);
  const setClosing = useApplicationStore((state) => state.setClosing);
  const page = useShellStore((state) => state.page);
  const setPage = useShellStore((state) => state.setPage);
  const inspectorRunId = useShellStore((state) => state.inspectorRunId);
  const setInspectorRunId = useShellStore((state) => state.setInspectorRunId);
  const conversationListWidth = useShellStore(
    (state) => state.conversationListWidth,
  );
  const setConversationListWidth = useShellStore(
    (state) => state.setConversationListWidth,
  );
  const selectedWorkspaceId = useSelectionStore((state) => state.workspaceId);
  const setSelectedWorkspaceId = useSelectionStore(
    (state) => state.setWorkspaceId,
  );
  const selectedConversationId = useSelectionStore(
    (state) => state.conversationId,
  );
  const setSelectedConversationId = useSelectionStore(
    (state) => state.setConversationId,
  );
  const selectedAgentId = useSelectionStore((state) => state.agentId);
  const setSelectedAgentId = useSelectionStore((state) => state.setAgentId);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const drafts = useConversationStore((state) => state.drafts);
  const failedMessages = useConversationStore((state) => state.failedMessages);
  const setDraftValue = useConversationStore((state) => state.setDraft);
  const setFailedMessage = useConversationStore(
    (state) => state.setFailedMessage,
  );
  const clearFailedMessage = useConversationStore(
    (state) => state.clearFailedMessage,
  );
  const enqueue = useConversationStore((state) => state.enqueue);
  const dequeue = useConversationStore((state) => state.dequeue);
  const logs = useLogStore((state) => state.entries);
  const appendLog = useLogStore((state) => state.append);
  const mergeLogHistory = useLogStore((state) => state.mergeHistory);
  const events = useRuntimeStore((state) => state.events);
  const appendEvent = useRuntimeStore((state) => state.appendEvent);
  const streamingByConversation = useRuntimeStore(
    (state) => state.streamingByConversation,
  );
  const appendTextDelta = useRuntimeStore((state) => state.appendTextDelta);
  const clearStreaming = useRuntimeStore((state) => state.clearStreaming);
  const messageListRef = useRef<VirtuosoHandle>(null);
  const [messagesAtLatest, setMessagesAtLatest] = useState(true);

  useEffect(() => {
    let active = true;
    void window.fastMpa.application.getSnapshot().then((next) => {
      if (active) {
        setSnapshot(next);
        setSelectedWorkspaceId(
          next.selectedWorkspaceId ?? next.workspaces[0]?.id,
        );
      }
    });
    void window.fastMpa.desktop.getInfo().then(setDesktopInfo);
    const unsubscribeSnapshot = window.fastMpa.application.onSnapshot(
      (next) => {
        if (active) setSnapshot(next);
      },
    );
    const unsubscribeEvents = window.fastMpa.application.onEvent((event) => {
      if (!active) return;
      appendEvent(event);
      const eventKey =
        event.context?.workspaceId && event.context.conversationId
          ? `${event.context.workspaceId}:${event.context.conversationId}`
          : undefined;
      if (eventKey && event.type === "text.delta")
        appendTextDelta(eventKey, event.delta);
      if (eventKey && event.type === "turn.completed") clearStreaming(eventKey);
    });
    const unsubscribeLogs = window.fastMpa.application.onLog((entry) => {
      if (active) appendLog(entry);
    });
    const unsubscribeClosing = window.fastMpa.desktop.onClosing(() => {
      if (active) setClosing(true);
    });
    return () => {
      active = false;
      unsubscribeSnapshot();
      unsubscribeEvents();
      unsubscribeLogs();
      unsubscribeClosing();
    };
  }, [
    appendEvent,
    appendLog,
    appendTextDelta,
    clearStreaming,
    setClosing,
    setDesktopInfo,
    setSnapshot,
    setSelectedWorkspaceId,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    let active = true;
    void window.fastMpa.application
      .getSnapshot({ workspaceId: selectedWorkspaceId })
      .then((next) => {
        if (active) setSnapshot(next);
      });
    return () => {
      active = false;
    };
  }, [selectedWorkspaceId, setSnapshot]);

  useEffect(() => {
    if (page !== "Logs") return;
    void window.fastMpa.application.getRecentLogs(100).then(mergeLogHistory);
  }, [mergeLogHistory, page]);

  const workspace =
    snapshot?.workspaces.find((item) => item.id === selectedWorkspaceId) ??
    snapshot?.workspaces[0];
  const conversations =
    snapshot?.conversations.filter(
      (conversation) =>
        conversation.workspaceId === workspace?.id &&
        (agentFilter === "all" ||
          conversation.participantIds.includes(agentFilter)) &&
        (conversation.title ?? "Untitled conversation")
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  const agents =
    snapshot?.participants.filter(
      (participant) =>
        participant.workspaceId === workspace?.id &&
        participant.kind === "agent",
    ) ?? [];
  const activeAgentId = selectedAgentId ?? agents[0]?.id ?? "demo-agent";
  const conversationId = selectedConversationId ?? conversations[0]?.id;
  const conversationKey =
    workspace && conversationId
      ? `${workspace.id}:${conversationId}`
      : undefined;
  const sendQueue = useConversationStore((state) =>
    conversationKey ? (state.sendQueues[conversationKey] ?? []) : [],
  );
  const draft = conversationKey ? (drafts[conversationKey] ?? "") : "";
  const failedMessage = conversationKey
    ? failedMessages[conversationKey]
    : undefined;
  const streamingText = conversationKey
    ? (streamingByConversation[conversationKey] ?? "")
    : "";
  function setDraft(value: string): void {
    if (!conversationKey) return;
    setDraftValue(conversationKey, value);
  }
  const messages = useMemo(
    () =>
      snapshot?.messages.filter(
        (message) => message.conversationId === conversationId,
      ) ?? [],
    [snapshot, conversationId],
  );
  const toolEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          conversationKey !== undefined &&
          event.context?.workspaceId &&
          event.context.conversationId &&
          `${event.context.workspaceId}:${event.context.conversationId}` ===
            conversationKey &&
          (event.type === "tool.started" ||
            event.type === "tool.approval_required" ||
            event.type === "tool.completed"),
      ),
    [conversationKey, events],
  );

  const dispatchMessage = useCallback(
    async (body: string): Promise<void> => {
      if (!workspace || !conversationId) return;
      setSending(true);
      setSendError(undefined);
      try {
        await window.fastMpa.application.dispatch({
          type: "submit",
          workspaceId: workspace.id,
          conversationId,
          body,
          agentId: activeAgentId,
        });
        if (conversationKey) clearFailedMessage(conversationKey);
      } catch (error: unknown) {
        if (conversationKey) {
          setDraftValue(conversationKey, body);
          setFailedMessage(conversationKey, body);
        }
        setSendError(
          error instanceof Error ? error.message : "Message failed to send",
        );
      } finally {
        setSending(false);
      }
    },
    [
      activeAgentId,
      clearFailedMessage,
      conversationId,
      conversationKey,
      setDraftValue,
      setFailedMessage,
      workspace,
    ],
  );

  async function submit(): Promise<void> {
    if (!draft.trim() || !workspace || !conversationId) return;
    const body = draft.trim();
    setDraft("");
    if (sending) {
      if (conversationKey) enqueue(conversationKey, body);
      return;
    }
    await dispatchMessage(body);
  }

  useEffect(() => {
    if (sending || sendQueue.length === 0) return;
    const next = sendQueue[0];
    if (conversationKey) dequeue(conversationKey);
    void dispatchMessage(next);
  }, [conversationKey, dequeue, dispatchMessage, sending, sendQueue]);

  function resizeConversationList(
    event: React.PointerEvent<HTMLButtonElement>,
  ): void {
    const startX = event.clientX;
    const startWidth = conversationListWidth;
    const handleMove = (moveEvent: PointerEvent): void => {
      setConversationListWidth(startWidth + moveEvent.clientX - startX);
    };
    const handleUp = (): void => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }

  return (
    <main className="app-shell">
      <header className="title-bar">
        <span className="brand-mark">F</span>
        <strong>FastMPA</strong>
        <select
          className="workspace-switcher"
          aria-label="Workspace"
          value={workspace?.id ?? ""}
          onChange={(event) => {
            setSelectedWorkspaceId(event.target.value);
            setSelectedConversationId(undefined);
            setSelectedAgentId(undefined);
            setAgentFilter("all");
          }}
        >
          <option value="" disabled>
            Loading workspace
          </option>
          {(snapshot?.workspaces ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="title-action"
          onClick={() =>
            void window.fastMpa.application.dispatch({
              type: "workspace.create",
              name: "New workspace",
            })
          }
        >
          +
        </button>
        <button
          type="button"
          className="title-action"
          disabled={!workspace}
          onClick={() => {
            if (!workspace) return;
            const name = window.prompt("Workspace name", workspace.name);
            if (name?.trim())
              void window.fastMpa.application.dispatch({
                type: "workspace.rename",
                workspaceId: workspace.id,
                name: name.trim(),
              });
          }}
        >
          Rename
        </button>
      </header>
      <div
        className="desktop-layout"
        style={{
          gridTemplateColumns: `72px ${conversationListWidth}px 5px minmax(0, 1fr)`,
        }}
      >
        <nav className="rail" aria-label="Primary navigation">
          <div className="rail-logo">F</div>
          {pages.map((item) => (
            <button
              type="button"
              className={page === item ? "rail-item active" : "rail-item"}
              key={item}
              onClick={() => setPage(item)}
              title={item}
            >
              {item.slice(0, 1)}
            </button>
          ))}
        </nav>
        <aside className="conversation-list">
          <div className="pane-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>{workspace?.name ?? "FastMPA"}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              title="New conversation"
              onClick={() =>
                workspace &&
                void window.fastMpa.application.dispatch({
                  type: "conversation.create",
                  workspaceId: workspace.id,
                })
              }
            >
              +
            </button>
          </div>
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
          <select
            className="search-input agent-filter"
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            aria-label="Filter conversations by agent"
          >
            <option value="all">All agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <div className="conversation-items">
            {conversations.map((conversation) => {
              const lastMessage = snapshot?.messages
                .filter((message) => message.conversationId === conversation.id)
                .at(-1);
              const run = snapshot?.runs.find(
                (item) => item.context?.conversationId === conversation.id,
              );
              const unread = snapshot?.attention?.inbox.some(
                (message) => message.conversationId === conversation.id,
              );
              const status = run?.status ?? (unread ? "waiting" : "active");
              return (
                <button
                  type="button"
                  className={
                    conversation.id === conversationId
                      ? "conversation-item selected"
                      : "conversation-item"
                  }
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <span className="conversation-dot" />
                  <span>
                    <strong>
                      {conversation.title ?? "Untitled conversation"}
                    </strong>
                    <small>{lastMessage?.body ?? "No messages yet"}</small>
                  </span>
                  <span
                    className={`conversation-status status-${status}`}
                    title={status}
                  />
                </button>
              );
            })}
          </div>
        </aside>
        <button
          type="button"
          className="pane-resizer"
          aria-label="Resize conversation list"
          onPointerDown={resizeConversationList}
        />
        <section className="chat-pane">
          <div className="chat-header">
            <div>
              <p className="eyebrow">{page}</p>
              <h2>
                {conversations.find(
                  (conversation) => conversation.id === conversationId,
                )?.title ?? "Select a conversation"}
              </h2>
            </div>
            <span className="status-pill">
              <span />
              Ready
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setInspectorRunId(
                  inspectorRunId ? undefined : snapshot?.runs[0]?.runId,
                )
              }
              disabled={!snapshot?.runs.length}
            >
              {inspectorRunId ? "Hide inspector" : "Show inspector"}
            </button>
          </div>
          {page === "Conversations" ? (
            <div className="message-list">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✦</div>
                  <h3>Start a conversation</h3>
                  <p>Send a message to begin a durable FastMPA run.</p>
                </div>
              ) : (
                <Virtuoso
                  ref={messageListRef}
                  data={messages}
                  followOutput={messagesAtLatest ? "smooth" : false}
                  atBottomStateChange={setMessagesAtLatest}
                  itemContent={(_index, message) => (
                    <article
                      className={
                        message.senderId === "human"
                          ? "message user"
                          : "message"
                      }
                      key={message.id}
                    >
                      <div className="avatar">
                        {message.senderId === "human" ? "You" : "A"}
                      </div>
                      <div>
                        <div className="message-meta">
                          {message.senderId === "human" ? "You" : "Agent"}
                        </div>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{ pre: MarkdownPre }}
                        >
                          {message.body}
                        </ReactMarkdown>
                      </div>
                    </article>
                  )}
                />
              )}
              {toolEvents.slice(-8).map((event) => (
                <ToolEventCard
                  key={JSON.stringify(event)}
                  event={event}
                  onDetails={setInspectorRunId}
                />
              ))}
              {!messagesAtLatest && messages.length > 0 && (
                <button
                  type="button"
                  className="back-latest-button"
                  onClick={() => {
                    messageListRef.current?.scrollToIndex({
                      index: "LAST",
                      behavior: "smooth",
                    });
                    setMessagesAtLatest(true);
                  }}
                >
                  Back to latest
                </button>
              )}
              {streamingText && (
                <article className="message streaming">
                  <div className="avatar">A</div>
                  <div>
                    <div className="message-meta">Agent · streaming</div>
                    <p>{streamingText}</p>
                  </div>
                </article>
              )}
            </div>
          ) : (
            <PageView
              page={page}
              snapshot={snapshot}
              logs={logs}
              events={events}
              desktopInfo={desktopInfo}
              onRunSelect={setInspectorRunId}
            />
          )}
          {page === "Conversations" && (
            <div className="composer">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Message FastMPA…"
                rows={3}
              />
              <div className="composer-options">
                <label>
                  Agent
                  <select
                    value={activeAgentId}
                    onChange={(event) => setSelectedAgentId(event.target.value)}
                    disabled={agents.length === 0 || sending}
                  >
                    {agents.length === 0 && (
                      <option value="demo-agent">Default agent</option>
                    )}
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                {sendQueue.length > 0 && <span>{sendQueue.length} queued</span>}
              </div>
              {sendError && (
                <div className="composer-error" role="alert">
                  {sendError}
                  {failedMessage && conversationKey && (
                    <div className="composer-error-actions">
                      <button
                        type="button"
                        onClick={() => {
                          clearFailedMessage(conversationKey);
                          void dispatchMessage(failedMessage);
                        }}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftValue(conversationKey, failedMessage);
                          clearFailedMessage(conversationKey);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => clearFailedMessage(conversationKey)}
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="composer-footer">
                <span>Enter to send · Shift+Enter for new line</span>
                <button
                  type="button"
                  className="send-button"
                  disabled={!draft.trim() || sending || closing}
                  onClick={() => void submit()}
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </section>
        {inspectorRunId && snapshot && (
          <aside className="inspector-pane" aria-label="Run inspector">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">Inspector</p>
                <h2>Run details</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close inspector"
                onClick={() => setInspectorRunId(undefined)}
              >
                ×
              </button>
            </div>
            {(() => {
              const run = snapshot.runs.find(
                (item) => item.runId === inspectorRunId,
              );
              if (!run) return <p className="empty-state">Run unavailable.</p>;
              const runEvents = events.filter(
                (event) => event.runId === run.runId,
              );
              const toolEventsForRun = runEvents.filter(
                (event) =>
                  event.type === "tool.started" ||
                  event.type === "tool.approval_required" ||
                  event.type === "tool.completed",
              );
              const canCancel = [
                "queued",
                "running",
                "retrying",
                "waiting",
              ].includes(run.status);
              const canRetry = ["failed", "cancelled", "interrupted"].includes(
                run.status,
              );
              return (
                <div className="inspector-content">
                  <div className="inspector-status">
                    <span>{run.phase}</span>
                    <strong>{run.status}</strong>
                  </div>
                  <div className="run-actions">
                    {canRetry && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          void window.fastMpa.application.dispatch({
                            type: "retry",
                            runId: run.runId,
                          })
                        }
                      >
                        Retry
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        className="secondary-button danger-button"
                        onClick={() =>
                          void window.fastMpa.application.dispatch({
                            type: "cancel",
                            runId: run.runId,
                          })
                        }
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <dl>
                    <dt>Run ID</dt>
                    <dd>{run.runId}</dd>
                    <dt>Attempt</dt>
                    <dd>{run.attempt}</dd>
                    <dt>Duration</dt>
                    <dd>{runDuration(run)}</dd>
                    <dt>Agent</dt>
                    <dd>{run.context?.agentId ?? "—"}</dd>
                    <dt>Workspace</dt>
                    <dd>{run.context?.workspaceId ?? "—"}</dd>
                    <dt>Conversation</dt>
                    <dd>{run.context?.conversationId ?? "—"}</dd>
                    <dt>Trigger</dt>
                    <dd>{run.context?.trigger ?? "—"}</dd>
                    <dt>Source</dt>
                    <dd>
                      {run.context?.sourceRef
                        ? `${run.context.sourceRef.type}:${run.context.sourceRef.id}`
                        : "—"}
                    </dd>
                  </dl>
                  {run.error && (
                    <div className="inspector-error" role="alert">
                      <strong>{run.error.code ?? run.error.name}</strong>
                      <span>{run.error.message}</span>
                      <small>
                        {run.error.retryable ? "Retryable" : "Not retryable"}
                      </small>
                    </div>
                  )}
                  {toolEventsForRun.length > 0 && (
                    <>
                      <h3>Tool calls</h3>
                      <div className="inspector-tools">
                        {toolEventsForRun.map((event) => (
                          <ToolEventCard
                            key={`${event.runId}-${event.type}-${JSON.stringify(event)}`}
                            event={event}
                            onDetails={setInspectorRunId}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <h3>Lifecycle events</h3>
                  <div className="inspector-events">
                    {runEvents.map((event) => (
                      <div
                        key={`${event.runId}-${event.type}-${JSON.stringify(event)}`}
                      >
                        <strong>{event.type}</strong>
                        <small>{JSON.stringify(event)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </aside>
        )}
      </div>
      {closing && (
        <div className="shutdown-overlay" role="status" aria-live="polite">
          <div className="shutdown-card">
            <span className="shutdown-spinner" />
            <strong>正在安全退出</strong>
            <p>FastMPA 正在完成当前任务并保存状态。</p>
          </div>
        </div>
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Renderer root element is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
