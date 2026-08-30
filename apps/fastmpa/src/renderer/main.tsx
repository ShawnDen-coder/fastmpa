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
import type {
  ApplicationEvent,
  ApplicationLogEntry,
  ApplicationSnapshot,
} from "../application.js";
import type { DesktopInfo } from "../shared/desktop-api.js";
import { PageView } from "./page-view.js";
import { useShellStore } from "./stores.js";
import "./styles.css";

const pages = [
  "Conversations",
  "Agents",
  "Runs",
  "Schedules",
  "Logs",
  "Settings",
];

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<ApplicationSnapshot>();
  const page = useShellStore((state) => state.page);
  const setPage = useShellStore((state) => state.setPage);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>();
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendQueue, setSendQueue] = useState<readonly string[]>([]);
  const [sendError, setSendError] = useState<string>();
  const [logs, setLogs] = useState<readonly ApplicationLogEntry[]>([]);
  const [events, setEvents] = useState<readonly ApplicationEvent[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo>();
  const [inspectorRunId, setInspectorRunId] = useState<string>();
  const [closing, setClosing] = useState(false);
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
      setEvents((current) => [...current.slice(-199), event]);
      if (event.type === "text.delta")
        setStreamingText((current) => current + event.delta);
      if (event.type === "turn.completed") setStreamingText("");
    });
    const unsubscribeLogs = window.fastMpa.application.onLog((entry) => {
      if (active) setLogs((current) => [...current.slice(-499), entry]);
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
  }, []);

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
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (page !== "Logs") return;
    void window.fastMpa.application.getRecentLogs(100).then(setLogs);
  }, [page]);

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
  useEffect(() => {
    if (conversationId === undefined) setStreamingText("");
    else setStreamingText("");
  }, [conversationId]);
  const messages = useMemo(
    () =>
      snapshot?.messages.filter(
        (message) => message.conversationId === conversationId,
      ) ?? [],
    [snapshot, conversationId],
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
      } catch (error: unknown) {
        setSendError(
          error instanceof Error ? error.message : "Message failed to send",
        );
      } finally {
        setSending(false);
      }
    },
    [activeAgentId, conversationId, workspace],
  );

  async function submit(): Promise<void> {
    if (!draft.trim() || !workspace || !conversationId) return;
    const body = draft.trim();
    setDraft("");
    if (sending) {
      setSendQueue((current) => [...current, body]);
      return;
    }
    await dispatchMessage(body);
  }

  useEffect(() => {
    if (sending || sendQueue.length === 0) return;
    const [next, ...remaining] = sendQueue;
    setSendQueue(remaining);
    void dispatchMessage(next);
  }, [dispatchMessage, sending, sendQueue]);

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
      <div className="desktop-layout">
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
                setInspectorRunId((current) =>
                  current ? undefined : snapshot?.runs[0]?.runId,
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.body}
                        </ReactMarkdown>
                      </div>
                    </article>
                  )}
                />
              )}
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
              return (
                <div className="inspector-content">
                  <div className="inspector-status">
                    <span>{run.phase}</span>
                    <strong>{run.status}</strong>
                  </div>
                  <dl>
                    <dt>Run ID</dt>
                    <dd>{run.runId}</dd>
                    <dt>Attempt</dt>
                    <dd>{run.attempt}</dd>
                  </dl>
                  <h3>Lifecycle events</h3>
                  <div className="inspector-events">
                    {events
                      .filter((event) => event.runId === run.runId)
                      .map((event) => (
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
