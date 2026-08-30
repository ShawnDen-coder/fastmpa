import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ApplicationLogEntry,
  ApplicationSnapshot,
} from "../application.js";
import { PageView } from "./page-view.js";
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
  const [page, setPage] = useState("Conversations");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<readonly ApplicationLogEntry[]>([]);

  useEffect(() => {
    const active = true;
    void window.fastMpa.application.getSnapshot().then((next) => {
      if (active) {
        setSnapshot(next);
        setSelectedWorkspaceId(
          next.selectedWorkspaceId ?? next.workspaces[0]?.id,
        );
      }
    });
    return window.fastMpa.application.onSnapshot((next) => {
      if (active) setSnapshot(next);
    });
  }, []);

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
        (conversation.title ?? "Untitled conversation")
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  const conversationId = selectedConversationId ?? conversations[0]?.id;
  const messages = useMemo(
    () =>
      snapshot?.messages.filter(
        (message) => message.conversationId === conversationId,
      ) ?? [],
    [snapshot, conversationId],
  );

  async function submit(): Promise<void> {
    if (!draft.trim() || !workspace || !conversationId || sending) return;
    setSending(true);
    try {
      await window.fastMpa.application.dispatch({
        type: "submit",
        workspaceId: workspace.id,
        conversationId,
        body: draft.trim(),
      });
      setDraft("");
    } finally {
      setSending(false);
    }
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
          <div className="conversation-items">
            {conversations.map((conversation) => (
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
                  <small>Conversation</small>
                </span>
              </button>
            ))}
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
                messages.map((message) => (
                  <article
                    className={
                      message.senderId === "human" ? "message user" : "message"
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
                      <p>{message.body}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : (
            <PageView page={page} snapshot={snapshot} logs={logs} />
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
              <div className="composer-footer">
                <span>Enter to send · Shift+Enter for new line</span>
                <button
                  type="button"
                  className="send-button"
                  disabled={!draft.trim() || sending}
                  onClick={() => void submit()}
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
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
