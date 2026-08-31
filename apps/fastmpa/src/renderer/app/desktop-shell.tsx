import { useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import type { ApplicationEvent } from "../../shared/contracts/application.js";
import { Composer } from "../features/conversations/composer.js";
import { ConversationCreateDialog } from "../features/conversations/conversation-create-dialog.js";
import { ConversationList } from "../features/conversations/conversation-list.js";
import { ConversationMembersDialog } from "../features/conversations/conversation-members-dialog.js";
import { ConversationTimeline } from "../features/conversations/conversation-timeline.js";
import { RunInspector } from "../features/runs/run-inspector.js";
import {
  useConversationStore,
  useRuntimeStore,
  useShellStore,
} from "../stores/index.js";
import { useNavigationController } from "./navigation-controller.js";
import { PageView } from "./page-view.js";
import { useShellSubscriptions } from "./shell-subscriptions.js";
import { useWorkspaceController } from "./workspace-controller.js";
import "../styles/tailwind.css";
import "../styles/shell.css";
import "../styles/conversations.css";
import "../styles/agents.css";
import "../styles/runs.css";
import "../styles/schedules.css";
import "../styles/settings.css";
import "../styles/logs.css";

const EMPTY_PERSISTED_EVENTS = [] as const;

const pages = [
  "Conversations",
  "Agents",
  "Runs",
  "Schedules",
  "Logs",
  "Settings",
];

function LiveConversationTimeline({
  conversationKey,
  ...props
}: Omit<
  React.ComponentProps<typeof ConversationTimeline>,
  "toolEvents" | "persistedEvents" | "streamingText"
> & {
  readonly conversationKey?: string;
}): React.JSX.Element {
  const events = useRuntimeStore((state) => state.events);
  const streamingText = useRuntimeStore((state) =>
    conversationKey
      ? (state.streamingByConversation[conversationKey] ?? "")
      : "",
  );
  const persistedEvents = useRuntimeStore((state) =>
    conversationKey
      ? (state.persistedEventsByConversation[conversationKey] ??
        EMPTY_PERSISTED_EVENTS)
      : EMPTY_PERSISTED_EVENTS,
  );
  const toolEvents = useMemo(
    () =>
      events.filter(
        (event: ApplicationEvent) =>
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
  return (
    <ConversationTimeline
      {...props}
      toolEvents={toolEvents}
      persistedEvents={persistedEvents}
      streamingText={streamingText}
    />
  );
}

export function DesktopShell(): React.JSX.Element {
  const shellSnapshot = useShellStore((state) => state.snapshot);
  const desktopInfo = useShellStore((state) => state.desktopInfo);
  const closing = useShellStore((state) => state.closing);
  const setConversationSnapshot = useConversationStore(
    (state) => state.setSnapshot,
  );
  const {
    page,
    inspectorRunId,
    conversationListWidth,
    setPage,
    setInspectorRunId,
    resizeConversationList,
  } = useNavigationController();
  const {
    workspace,
    conversations,
    agents,
    selectedConversation,
    conversationId,
    selectedWorkspaceId,
    search,
    agentFilter,
    setSearch,
    setAgentFilter,
    selectWorkspace,
    selectConversation: setSelectedConversationId,
  } = useWorkspaceController(shellSnapshot ?? undefined);
  const runSnapshots = useRuntimeStore((state) => state.snapshots);
  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [renameWorkspaceOpen, setRenameWorkspaceOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const events = useRuntimeStore((state) => state.events);
  const mergePersistedEvents = useRuntimeStore(
    (state) => state.mergePersistedEvents,
  );
  const messageListRef = useRef<VirtuosoHandle>(null);
  const [messagesAtLatest, setMessagesAtLatest] = useState(true);

  useShellSubscriptions(selectedWorkspaceId);

  const conversationKey =
    workspace && conversationId
      ? `${workspace.id}:${conversationId}`
      : undefined;
  const conversationSnapshot = useConversationStore((state) =>
    conversationKey ? state.snapshots[conversationKey] : undefined,
  );
  useEffect(() => {
    if (!workspace || !conversationId || !conversationKey) return;
    void window.fastMpa.application
      .getConversationSnapshot({
        workspaceId: workspace.id,
        conversationId,
      })
      .then((next) => {
        setConversationSnapshot(
          { workspaceId: workspace.id, conversationId },
          next,
        );
        mergePersistedEvents(conversationKey, next.events);
      });
  }, [
    conversationId,
    conversationKey,
    mergePersistedEvents,
    setConversationSnapshot,
    workspace,
  ]);
  const messages = useMemo(
    () => conversationSnapshot?.messages ?? [],
    [conversationSnapshot],
  );
  const failedRun = useMemo(
    () =>
      conversationSnapshot?.runs
        .filter((run) =>
          ["failed", "cancelled", "interrupted"].includes(run.status),
        )
        .at(-1),
    [conversationSnapshot],
  );

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
            selectWorkspace(event.target.value);
          }}
        >
          <option value="" disabled>
            Loading workspace
          </option>
          {(shellSnapshot?.workspaces ?? []).map((item) => (
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
            setWorkspaceNameDraft(workspace.name);
            setRenameWorkspaceOpen(true);
          }}
        >
          Rename
        </button>
        <span className="title-model-status" role="status">
          {desktopInfo?.model ?? "Model not configured"}
        </span>
        <input
          className="title-search"
          aria-label="Search conversations"
          placeholder="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>
      {renameWorkspaceOpen && workspace && (
        <div className="dialog-backdrop" role="presentation">
          <form
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-workspace-title"
            onSubmit={(event) => {
              event.preventDefault();
              const name = workspaceNameDraft.trim();
              if (!name) return;
              void window.fastMpa.application
                .dispatch({
                  type: "workspace.rename",
                  workspaceId: workspace.id,
                  name,
                })
                .finally(() => setRenameWorkspaceOpen(false));
            }}
          >
            <p className="eyebrow">Workspace</p>
            <h2 id="rename-workspace-title">Rename workspace</h2>
            <label>
              Name
              <input
                value={workspaceNameDraft}
                onChange={(event) => setWorkspaceNameDraft(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRenameWorkspaceOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="send-button"
                disabled={!workspaceNameDraft.trim()}
              >
                Rename
              </button>
            </div>
          </form>
        </div>
      )}
      {conversationDialogOpen && workspace && (
        <ConversationCreateDialog
          workspaceId={workspace.id}
          agents={agents}
          onClose={() => setConversationDialogOpen(false)}
          onCreated={(createdConversationId) => {
            setConversationDialogOpen(false);
            if (createdConversationId)
              setSelectedConversationId(createdConversationId);
          }}
        />
      )}
      {membersDialogOpen && selectedConversation?.kind === "group" && (
        <ConversationMembersDialog
          conversation={selectedConversation}
          agents={agents}
          onClose={() => setMembersDialogOpen(false)}
        />
      )}
      <div
        className="desktop-layout"
        style={{
          gridTemplateColumns: inspectorRunId
            ? `72px ${conversationListWidth}px 5px minmax(0, 1fr) 420px`
            : `72px ${conversationListWidth}px 5px minmax(0, 1fr)`,
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
        <ConversationList
          workspace={workspace}
          conversations={shellSnapshot?.conversations ?? []}
          participants={shellSnapshot?.participants ?? []}
          selectedConversationId={conversationId}
          search={search}
          agentFilter={agentFilter}
          onSearchChange={setSearch}
          onAgentFilterChange={setAgentFilter}
          onConversationSelect={setSelectedConversationId}
          onCreateConversation={() => setConversationDialogOpen(true)}
        />
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
            {selectedConversation && (
              <span className="status-pill">
                <span />
                {selectedConversation.activeRunStatus ??
                  (selectedConversation.unread ? "Waiting" : "Idle")}
              </span>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setInspectorRunId(
                  inspectorRunId
                    ? undefined
                    : Object.values(runSnapshots)[0]?.run?.runId,
                )
              }
              disabled={Object.values(runSnapshots).every((item) => !item.run)}
            >
              {inspectorRunId ? "Hide inspector" : "Show inspector"}
            </button>
            {page === "Conversations" &&
              selectedConversation?.kind === "group" && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setMembersDialogOpen(true)}
                >
                  Members
                </button>
              )}
          </div>
          {page === "Conversations" ? (
            <LiveConversationTimeline
              messages={messages}
              conversationKey={conversationKey}
              messageListRef={messageListRef}
              messagesAtLatest={messagesAtLatest}
              onMessagesAtLatestChange={setMessagesAtLatest}
              failedRun={failedRun}
              onRunSelect={setInspectorRunId}
            />
          ) : (
            <PageView
              page={page}
              snapshot={shellSnapshot}
              runs={Object.values(runSnapshots)
                .map((item) => item.run)
                .filter((run): run is NonNullable<typeof run> => Boolean(run))}
              events={events}
              desktopInfo={desktopInfo}
              workspaceId={selectedWorkspaceId}
              onRunSelect={setInspectorRunId}
            />
          )}
          {page === "Conversations" && (
            <Composer
              workspaceId={workspace?.id}
              conversationId={conversationId}
              conversation={selectedConversation}
              agents={agents}
              closing={closing}
            />
          )}
        </section>
        {inspectorRunId && runSnapshots[inspectorRunId] && (
          <RunInspector
            snapshot={runSnapshots[inspectorRunId]}
            events={events}
            runId={inspectorRunId}
            onClose={() => setInspectorRunId(undefined)}
          />
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
