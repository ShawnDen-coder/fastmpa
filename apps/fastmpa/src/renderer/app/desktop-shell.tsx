import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import type { ApplicationEvent } from "../../shared/contracts/application.js";
import type { SnapshotInvalidation } from "../../shared/contracts/invalidation.js";
import { Composer } from "../features/conversations/composer.js";
import { ConversationCreateDialog } from "../features/conversations/conversation-create-dialog.js";
import { ConversationList } from "../features/conversations/conversation-list.js";
import { ConversationMembersDialog } from "../features/conversations/conversation-members-dialog.js";
import { ConversationTimeline } from "../features/conversations/conversation-timeline.js";
import { RunInspector } from "../features/runs/run-inspector.js";
import {
  useConversationStore,
  useRuntimeStore,
  useSelectionStore,
  useShellStore,
} from "../stores/index.js";
import { PageView } from "./page-view.js";
import "../styles/tailwind.css";
import "../styles/components.css";

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
  const setShellSnapshot = useShellStore((state) => state.setSnapshot);
  const desktopInfo = useShellStore((state) => state.desktopInfo);
  const setDesktopInfo = useShellStore((state) => state.setDesktopInfo);
  const closing = useShellStore((state) => state.closing);
  const setClosing = useShellStore((state) => state.setClosing);
  const setConversationSnapshot = useConversationStore(
    (state) => state.setSnapshot,
  );
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
  const runSnapshots = useRuntimeStore((state) => state.snapshots);
  const setRunSnapshot = useRuntimeStore((state) => state.setSnapshot);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [renameWorkspaceOpen, setRenameWorkspaceOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const mergeEvents = useRuntimeStore((state) => state.mergeEvents);
  const mergePersistedEvents = useRuntimeStore(
    (state) => state.mergePersistedEvents,
  );
  const events = useRuntimeStore((state) => state.events);
  const messageListRef = useRef<VirtuosoHandle>(null);
  const [messagesAtLatest, setMessagesAtLatest] = useState(true);

  const hydrateRunSnapshots = useCallback(
    async (next: typeof shellSnapshot): Promise<void> => {
      if (!next) return;
      const runIds = new Set(
        next.dispatches.flatMap((dispatch) =>
          dispatch.assignments.map((assignment) => assignment.runId),
        ),
      );
      await Promise.all(
        [...runIds].map(async (runId) => {
          const snapshot =
            await window.fastMpa.application.getRunSnapshot(runId);
          setRunSnapshot(snapshot, runId);
        }),
      );
    },
    [setRunSnapshot],
  );

  const refreshInvalidatedSnapshot = useCallback(
    async (scope: SnapshotInvalidation): Promise<void> => {
      const selection = useSelectionStore.getState();
      if (scope.scope === "shell") {
        const next = await window.fastMpa.application.getShellSnapshot();
        setShellSnapshot(next);
        await hydrateRunSnapshots(next);
        return;
      }
      if (scope.scope === "conversation") {
        if (
          scope.workspaceId !== selection.workspaceId ||
          scope.conversationId !== selection.conversationId
        )
          return;
        const next = await window.fastMpa.application.getConversationSnapshot({
          workspaceId: scope.workspaceId,
          conversationId: scope.conversationId,
        });
        setConversationSnapshot(
          {
            workspaceId: scope.workspaceId,
            conversationId: scope.conversationId,
          },
          next,
        );
        mergePersistedEvents(
          `${scope.workspaceId}:${scope.conversationId}`,
          next.events,
        );
        return;
      }
      if (scope.scope === "dispatch") {
        const next = await window.fastMpa.application.getShellSnapshot();
        setShellSnapshot(next);
        await hydrateRunSnapshots(next);
        return;
      }
      const next = await window.fastMpa.application.getRunSnapshot(scope.runId);
      setRunSnapshot(next, scope.runId);
    },
    [
      mergePersistedEvents,
      hydrateRunSnapshots,
      setConversationSnapshot,
      setRunSnapshot,
      setShellSnapshot,
    ],
  );

  useEffect(() => {
    let active = true;
    void window.fastMpa.application.getShellSnapshot().then((next) => {
      if (active) {
        setShellSnapshot(next);
        setSelectedWorkspaceId(
          next.selectedWorkspaceId ?? next.workspaces[0]?.id,
        );
        void hydrateRunSnapshots(next);
      }
    });
    void window.fastMpa.desktop.getInfo().then(setDesktopInfo);
    const unsubscribeEvents = window.fastMpa.application.onEvents(
      (incoming) => {
        if (!active) return;
        mergeEvents(incoming);
      },
    );
    const unsubscribeInvalidation =
      window.fastMpa.application.onSnapshotInvalidated((scope) => {
        void refreshInvalidatedSnapshot(scope);
      });
    const unsubscribeClosing = window.fastMpa.desktop.onClosing(() => {
      if (active) setClosing(true);
    });
    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeInvalidation();
      unsubscribeClosing();
    };
  }, [
    mergeEvents,
    hydrateRunSnapshots,
    setClosing,
    setDesktopInfo,
    setShellSnapshot,
    setSelectedWorkspaceId,
    refreshInvalidatedSnapshot,
  ]);

  const workspace =
    shellSnapshot?.workspaces.find((item) => item.id === selectedWorkspaceId) ??
    shellSnapshot?.workspaces[0];
  const conversations =
    shellSnapshot?.conversations.filter(
      (conversation) =>
        conversation.workspaceId === workspace?.id &&
        (agentFilter === "all" ||
          conversation.participantIds.includes(agentFilter)) &&
        (conversation.title ?? "Untitled conversation")
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  const agents =
    shellSnapshot?.participants.filter(
      (participant) =>
        participant.workspaceId === workspace?.id &&
        participant.kind === "agent",
    ) ?? [];
  const conversationId = selectedConversationId ?? conversations[0]?.id;
  const conversationKey =
    workspace && conversationId
      ? `${workspace.id}:${conversationId}`
      : undefined;
  const conversationSnapshot = useConversationStore((state) =>
    conversationKey ? state.snapshots[conversationKey] : undefined,
  );
  const selectedConversation = shellSnapshot?.conversations.find(
    (conversation) => conversation.id === conversationId,
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
            setAgentFilter("all");
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
        <span
          className="title-model-status"
          role="status"
          aria-label="Model connection status"
        >
          <span /> demo · connected
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
            <span className="status-pill">
              <span />
              Ready
            </span>
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
