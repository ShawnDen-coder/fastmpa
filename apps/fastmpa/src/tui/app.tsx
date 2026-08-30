import { Box, Text, useApp, useInput } from "ink";
import React from "react";
import type {
  ApplicationLogEntry,
  ApplicationSnapshot,
  FastMpaApplication,
} from "../application.js";
import { ApprovalCard } from "./approval-card.js";
import { type AuxiliaryView, AuxiliaryViewPanel } from "./auxiliary-view.js";
import { CommandPalette } from "./command-palette.js";
import { ConversationView } from "./conversation-view.js";
import { LogView } from "./log-view.js";
import { RunDetails } from "./run-details.js";
import { StatusBar } from "./status-bar.js";

interface ConversationUiState {
  readonly streamingText: string;
  readonly liveTool?: string;
  readonly queuedCount: number;
  readonly failedDraft?: string;
}

const emptyConversationUiState: ConversationUiState = {
  streamingText: "",
  queuedCount: 0,
};

function conversationKey(
  workspaceId: string | undefined,
  conversationId: string | undefined,
): string {
  return `${workspaceId ?? "default"}:${conversationId ?? "default"}`;
}

export function FastMpaTui({
  application,
}: {
  readonly application: FastMpaApplication;
}): React.ReactElement {
  const [snapshot, setSnapshot] = React.useState<
    ApplicationSnapshot | undefined
  >();
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [logs, setLogs] = React.useState<readonly ApplicationLogEntry[]>([]);
  const [logsVisible, setLogsVisible] = React.useState(false);
  const [commandPalette, setCommandPalette] = React.useState(false);
  const [conversationUi, setConversationUi] = React.useState<
    Readonly<Record<string, ConversationUiState>>
  >({});
  const [focus, setFocus] = React.useState<
    "left" | "middle" | "right" | "logs"
  >("middle");
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    React.useState<string>();
  const [selectedConversationId, setSelectedConversationId] =
    React.useState<string>();
  const [selectedAgentId, setSelectedAgentId] = React.useState("demo-agent");
  const [minimumLogLevel, setMinimumLogLevel] = React.useState(0);
  const [currentRunOnly, setCurrentRunOnly] = React.useState(false);
  const [confirmExit, setConfirmExit] = React.useState(false);
  const [selectedRunIndex, setSelectedRunIndex] = React.useState(0);
  const [logOffset, setLogOffset] = React.useState(0);
  const [logFollow, setLogFollow] = React.useState(true);
  const [detailsVisible, setDetailsVisible] = React.useState(false);
  const [approvalAction, setApprovalAction] = React.useState(0);
  const [auxiliaryView, setAuxiliaryView] =
    React.useState<AuxiliaryView>("runs");
  const [dialog, setDialog] = React.useState<
    "workspace" | "conversation" | "rename" | undefined
  >();
  const activeConversationKey = conversationKey(
    selectedWorkspaceId,
    selectedConversationId,
  );
  const activeConversationUi =
    conversationUi[activeConversationKey] ?? emptyConversationUiState;
  const updateConversationUi = React.useCallback(
    (
      key: string,
      update: (state: ConversationUiState) => ConversationUiState,
    ) =>
      setConversationUi((states) => ({
        ...states,
        [key]: update(states[key] ?? emptyConversationUiState),
      })),
    [],
  );
  const clearFailedDraft = React.useCallback(
    (key: string) =>
      updateConversationUi(key, (state) => ({
        ...state,
        failedDraft: undefined,
      })),
    [updateConversationUi],
  );
  const { exit } = useApp();
  const approval = [
    snapshot?.runs[selectedRunIndex],
    ...(snapshot?.runs ?? []),
  ].find((run) => {
    if (!run) return false;
    if (run.status !== "waiting") return false;
    const details = run.error?.details;
    return (
      typeof details === "object" &&
      details !== null &&
      typeof (details as { approvalId?: unknown }).approvalId === "string"
    );
  });
  React.useEffect(() => {
    void application
      .getSnapshot()
      .then((next) => {
        const nextWorkspaceId = next.selectedWorkspaceId ?? workspaceId(next);
        const nextConversationId =
          next.selectedConversationId ?? next.conversations[0]?.id;
        setSnapshot(next);
        setSelectedWorkspaceId(nextWorkspaceId);
        setSelectedConversationId(nextConversationId);
        setSelectedAgentId(
          next.participants.find((participant) => participant.kind === "agent")
            ?.id ?? "demo-agent",
        );
        if (nextWorkspaceId && nextConversationId)
          return application.getSnapshot({
            workspaceId: nextWorkspaceId,
            conversationId: nextConversationId,
          });
        return next;
      })
      .then(setSnapshot);
    setLogs(application.getRecentLogs(100));
    const unsubscribeSnapshot = application.subscribe(setSnapshot);
    const unsubscribeLogs = application.subscribeLogs((entry) =>
      setLogs((current) => [...current.slice(-99), entry]),
    );
    const unsubscribeEvents = application.subscribeEvents((event) => {
      const key = conversationKey(
        event.context?.workspaceId,
        event.context?.conversationId,
      );
      updateConversationUi(key, (current) => {
        if (event.type === "text.delta")
          return {
            ...current,
            streamingText: current.streamingText + event.delta,
          };
        if (event.type === "tool.started")
          return { ...current, liveTool: event.toolName };
        if (event.type === "tool.completed")
          return { ...current, liveTool: undefined };
        if (event.type === "turn.completed")
          return { ...current, streamingText: "", liveTool: undefined };
        return current;
      });
    });
    return () => {
      unsubscribeSnapshot();
      unsubscribeLogs();
      unsubscribeEvents();
    };
  }, [application, updateConversationUi]);
  const refreshSelection = React.useCallback(
    (workspaceId: string, conversationId?: string) => {
      setSelectedWorkspaceId(workspaceId);
      setSelectedConversationId(conversationId);
      void application
        .getSnapshot({ workspaceId, conversationId })
        .then((next) => {
          const nextConversationId =
            conversationId ?? next.conversations[0]?.id;
          setSelectedConversationId(nextConversationId);
          if (!nextConversationId) return next;
          return application.getSnapshot({
            workspaceId,
            conversationId: nextConversationId,
          });
        })
        .then(setSnapshot);
    },
    [application],
  );
  useInput((value, key) => {
    if (confirmExit) {
      if (value.toLowerCase() === "y") exit();
      else if (value.toLowerCase() === "n" || key.escape) setConfirmExit(false);
      return;
    }
    if (commandPalette) {
      if (key.escape || (key.ctrl && value === "k")) {
        setCommandPalette(false);
        return;
      }
      if (value === "l") {
        setLogsVisible(true);
        setCommandPalette(false);
        return;
      }
      if (value === "w" || value === "c") {
        setFocus(value === "w" ? "left" : value === "c" ? "middle" : "right");
        setCommandPalette(false);
        return;
      }
      if (value === "r" || value === "s" || value === "a") {
        setAuxiliaryView(
          value === "r" ? "runs" : value === "s" ? "schedules" : "attention",
        );
        setFocus("right");
        setCommandPalette(false);
        return;
      }
      if (value === "g") {
        const agents = (snapshot?.participants ?? []).filter(
          (participant) => participant.kind === "agent",
        );
        if (agents.length > 0) {
          const current = agents.findIndex(
            (agent) => agent.id === selectedAgentId,
          );
          setSelectedAgentId(
            agents[(current + 1 + agents.length) % agents.length]?.id ??
              agents[0].id,
          );
        }
        setCommandPalette(false);
        return;
      }
      if (value === "n") {
        setDialog(focus === "left" ? "workspace" : "conversation");
        setCommandPalette(false);
        setInput("");
        return;
      }
      if (activeConversationUi.failedDraft && value === "y") {
        setCommandPalette(false);
        setInput(activeConversationUi.failedDraft);
        clearFailedDraft(activeConversationKey);
        return;
      }
      if (activeConversationUi.failedDraft && value === "e") {
        setCommandPalette(false);
        setInput(activeConversationUi.failedDraft);
        clearFailedDraft(activeConversationKey);
        return;
      }
      if (activeConversationUi.failedDraft && value === "d") {
        setCommandPalette(false);
        clearFailedDraft(activeConversationKey);
        setError(undefined);
        return;
      }
      return;
    }
    if (key.ctrl && value === "k") {
      setCommandPalette(true);
      return;
    }
    if (key.ctrl && value === "l") {
      setLogsVisible((visible) => {
        setFocus(visible ? "middle" : "logs");
        return !visible;
      });
      setLogFollow(true);
      setLogOffset(0);
      return;
    }
    if (key.ctrl && value === "e") {
      setCurrentRunOnly((current) => !current);
      return;
    }
    if (focus === "right" && !dialog && ["1", "2", "3", "4"].includes(value)) {
      setMinimumLogLevel(Number(value) - 1);
      return;
    }
    if (key.ctrl && value === "n") {
      setDialog(focus === "left" ? "workspace" : "conversation");
      setInput("");
      return;
    }
    if (key.ctrl && value === "r" && selectedWorkspaceId) {
      setDialog("rename");
      setInput("");
      return;
    }
    if (key.tab) {
      setFocus((current) => {
        const areas = ["left", "middle", "right", "logs"] as const;
        const index = areas.indexOf(current);
        return areas[
          (index + (key.shift ? -1 : 1) + areas.length) % areas.length
        ];
      });
      return;
    }
    if (key.escape) {
      if (dialog) {
        setDialog(undefined);
        setInput("");
      } else if (detailsVisible) setDetailsVisible(false);
      else if (logsVisible) {
        setLogsVisible(false);
        setFocus("middle");
      } else exit();
      return;
    }
    if (key.ctrl && value === "c") {
      const activeRun = snapshot?.runs.find(
        (run) => run.status === "running" || run.status === "queued",
      );
      if (activeRun) {
        void application.dispatch({ type: "cancel", runId: activeRun.runId });
      } else if (activeConversationUi.queuedCount > 0) {
        setConfirmExit(true);
      } else exit();
      return;
    }
    if (approval && key.ctrl && value === "a") {
      const details = approval.error?.details as { approvalId: string };
      void application
        .dispatch({
          type: "approve",
          runId: approval.runId,
          approvalId: details.approvalId,
        })
        .then(() => setError(undefined))
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason)),
        );
      return;
    }
    if (key.ctrl && value === "d") {
      if (snapshot?.runs[selectedRunIndex]) setDetailsVisible(true);
      return;
    }
    if (key.ctrl && value === "x") {
      if (approval) {
        const details = approval.error?.details as { approvalId: string };
        void application.dispatch({
          type: "reject",
          runId: approval.runId,
          approvalId: details.approvalId,
        });
      } else {
        const activeRun = snapshot?.runs[selectedRunIndex];
        if (
          activeRun &&
          (activeRun.status === "running" || activeRun.status === "queued")
        )
          void application.dispatch({ type: "cancel", runId: activeRun.runId });
      }
      return;
    }
    if (approval && !dialog && !logsVisible) {
      if (key.leftArrow || key.rightArrow) {
        setApprovalAction((action) =>
          Math.min(2, Math.max(0, action + (key.rightArrow ? 1 : -1))),
        );
        return;
      }
      if (key.return) {
        const details = approval.error?.details as { approvalId: string };
        if (approvalAction === 0)
          void application.dispatch({
            type: "approve",
            runId: approval.runId,
            approvalId: details.approvalId,
          });
        else if (approvalAction === 1)
          void application.dispatch({
            type: "reject",
            runId: approval.runId,
            approvalId: details.approvalId,
          });
        else setDetailsVisible(true);
        return;
      }
    }
    if ((key.return && key.shift) || (key.ctrl && value === "j")) {
      setInput((current) => `${current}\n`);
      return;
    }
    if (key.upArrow || key.downArrow) {
      if (focus === "logs") {
        const filteredLogs = filteredLogEntries(
          logs,
          minimumLogLevel,
          currentRunOnly,
          snapshot,
          selectedRunIndex,
        );
        const maximum = Math.max(0, filteredLogs.length - 8);
        setLogFollow(false);
        setLogOffset((offset) =>
          Math.min(maximum, Math.max(0, offset + (key.upArrow ? 1 : -1))),
        );
      } else if (focus === "left") {
        const workspaces = snapshot?.workspaces ?? [];
        const current = Math.max(
          0,
          workspaces.findIndex((item) => item.id === selectedWorkspaceId),
        );
        const next = Math.min(
          workspaces.length - 1,
          Math.max(0, current + (key.upArrow ? -1 : 1)),
        );
        const workspace = workspaces[next];
        if (workspace) refreshSelection(workspace.id);
      } else if (focus === "middle") {
        const current = Math.max(
          0,
          (snapshot?.conversations ?? []).findIndex(
            (item) => item.id === selectedConversationId,
          ),
        );
        const next = Math.min(
          (snapshot?.conversations.length ?? 1) - 1,
          Math.max(0, current + (key.upArrow ? -1 : 1)),
        );
        const conversation = snapshot?.conversations[next];
        if (conversation)
          refreshSelection(conversation.workspaceId, conversation.id);
      } else if (focus === "right") {
        const maximum = Math.max(0, (snapshot?.runs.length ?? 1) - 1);
        setSelectedRunIndex((index) =>
          Math.min(maximum, Math.max(0, index + (key.upArrow ? -1 : 1))),
        );
      }
      return;
    }
    if ((key.return || value === "\r" || value === "\n") && dialog) {
      const name = input.trim();
      if (!name) return;
      const command =
        dialog === "workspace"
          ? { type: "workspace.create" as const, name }
          : dialog === "conversation"
            ? {
                type: "conversation.create" as const,
                workspaceId: selectedWorkspaceId ?? "default",
                title: name,
              }
            : {
                type: "workspace.rename" as const,
                workspaceId: selectedWorkspaceId ?? "default",
                name,
              };
      setInput("");
      setDialog(undefined);
      void application
        .dispatch(command)
        .then(() =>
          dialog === "workspace"
            ? application.getSnapshot()
            : application.getSnapshot({ workspaceId: selectedWorkspaceId }),
        )
        .then((next) => {
          if (dialog === "workspace") {
            const created = next.workspaces.at(-1);
            if (created) {
              const id = created.id;
              setSelectedWorkspaceId(id);
              return application.getSnapshot({ workspaceId: id });
            }
          }
          setSnapshot(next);
          return next;
        })
        .then((next) => {
          if (dialog === "workspace" && next) setSnapshot(next);
          if (dialog === "conversation" && next)
            setSelectedConversationId(next.conversations.at(-1)?.id);
        })
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason)),
        );
      return;
    }
    if ((key.return || value === "\r" || value === "\n") && input.trim()) {
      const task = input;
      setInput("");
      const submissionKey = activeConversationKey;
      updateConversationUi(submissionKey, (state) => ({
        ...state,
        queuedCount: state.queuedCount + 1,
      }));
      void application
        .dispatch({
          type: "submit",
          workspaceId: selectedWorkspaceId ?? "default",
          conversationId: selectedConversationId ?? "default",
          body: task,
          agentId: selectedAgentId,
        })
        .finally(() =>
          updateConversationUi(submissionKey, (state) => ({
            ...state,
            queuedCount: Math.max(0, state.queuedCount - 1),
          })),
        )
        .then(() => {
          setError(undefined);
          clearFailedDraft(submissionKey);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : String(reason));
          updateConversationUi(submissionKey, (state) => ({
            ...state,
            failedDraft: task,
          }));
        });
    } else if (key.backspace) setInput((current) => current.slice(0, -1));
    else if (!key.ctrl && !key.meta && value)
      setInput((current) => current + value);
  });
  const workspaceName =
    snapshot?.workspaces.find((item) => item.id === selectedWorkspaceId)
      ?.name ??
    selectedWorkspaceId ??
    "default";
  const conversationName =
    snapshot?.conversations.find((item) => item.id === selectedConversationId)
      ?.title ??
    selectedConversationId ??
    "default";
  React.useEffect(() => {
    if (focus === "logs") setLogsVisible(true);
  }, [focus]);
  return (
    <Box flexDirection="column">
      <Text color="cyan">
        FastMPA · {workspaceName} / {conversationName} · Demo Agent
      </Text>
      {!logsVisible && focus === "middle" ? (
        <ConversationView
          messages={snapshot?.messages ?? []}
          streamingText={activeConversationUi.streamingText}
          liveTool={activeConversationUi.liveTool}
        />
      ) : null}
      {!logsVisible && focus !== "middle" ? (
        <Box>
          <Box width="25%" flexDirection="column">
            <Text color="cyan">
              Workspace / Conversation [{focus === "left" ? "focus" : ""}]
            </Text>
            {(snapshot?.workspaces ?? []).map((item) => {
              const workspace = item;
              return (
                <React.Fragment key={workspace.id}>
                  <Text
                    color={
                      workspace.id === selectedWorkspaceId ? "cyan" : undefined
                    }
                  >
                    {workspace.id === selectedWorkspaceId ? "> " : "  "}
                    {workspace.name}
                  </Text>
                  {workspace.id === selectedWorkspaceId
                    ? snapshot?.conversations.map((conversation) => (
                        <Text key={conversation.id}>
                          {conversation.id === selectedConversationId
                            ? "  > "
                            : "    "}
                          {conversation.title ?? conversation.id}
                        </Text>
                      ))
                    : null}
                </React.Fragment>
              );
            })}
            {snapshot?.participants.map((participant) => (
              <Text key={participant.id}>
                {participant.kind}: {participant.name}
              </Text>
            ))}
          </Box>
          <ConversationView
            messages={snapshot?.messages ?? []}
            streamingText={activeConversationUi.streamingText}
            liveTool={activeConversationUi.liveTool}
          />
          <Box width="25%" flexDirection="column">
            <AuxiliaryViewPanel snapshot={snapshot} view={auxiliaryView} />
          </Box>
        </Box>
      ) : null}
      {logsVisible ? (
        <LogView
          entries={logs}
          snapshot={snapshot}
          path={application.getLogPath()}
          minimumLevel={minimumLogLevel}
          currentRunOnly={currentRunOnly}
          selectedRunIndex={selectedRunIndex}
          offset={logOffset}
          follow={logFollow}
          workspaceId={selectedWorkspaceId}
          conversationId={selectedConversationId}
        />
      ) : null}
      {dialog ? (
        <Text color="cyan">
          {dialog === "workspace"
            ? "New Workspace name"
            : dialog === "conversation"
              ? "New Conversation title"
              : "Rename Workspace"}
          : {input}
        </Text>
      ) : null}
      <StatusBar
        workspace={selectedWorkspaceId ?? "default"}
        conversation={selectedConversationId ?? "default"}
        agent={selectedAgentId}
        status={composerStatus(
          snapshot,
          activeConversationUi.queuedCount,
          Boolean(error),
        )}
      />
      <Text color="gray">&gt; {input}</Text>
      {approval ? (
        <ApprovalCard
          toolName={approval.error?.name ?? "tool"}
          approvalId={
            typeof approval.error?.details === "object" &&
            approval.error.details !== null
              ? (approval.error.details as { approvalId: string }).approvalId
              : ""
          }
          selectedAction={approvalAction}
        />
      ) : null}
      {detailsVisible && snapshot?.runs[selectedRunIndex] ? (
        <RunDetails run={snapshot.runs[selectedRunIndex]} />
      ) : null}
      {error ? <Text color="red">Error: {error}</Text> : null}
      {activeConversationUi.failedDraft ? (
        <Text color="yellow">
          Failed message retained · Ctrl+K then [y] Retry [e] Edit [d] Discard
        </Text>
      ) : null}
      {confirmExit ? (
        <Text color="yellow">
          Unsent messages are queued locally and will be lost. Exit? [y/N]
        </Text>
      ) : null}
      {commandPalette ? (
        <CommandPalette
          hasFailedDraft={activeConversationUi.failedDraft !== undefined}
        />
      ) : null}
    </Box>
  );
}

function workspaceId(snapshot: ApplicationSnapshot): string | undefined {
  const first = snapshot.workspaces[0];
  return first?.id;
}

function composerStatus(
  snapshot: ApplicationSnapshot | undefined,
  queuedCount: number,
  hasError: boolean,
): "ready" | "queued" | "submitting" | "waiting" | "error" {
  if (hasError) return "error";
  if (queuedCount > 1) return "queued";
  if (queuedCount === 1) return "submitting";
  if (snapshot?.runs.some((run) => run.status === "waiting")) return "waiting";
  return "ready";
}

function filteredLogEntries(
  logs: readonly ApplicationLogEntry[],
  minimumLogLevel: number,
  currentRunOnly: boolean,
  snapshot: ApplicationSnapshot | undefined,
  selectedRunIndex: number,
): readonly ApplicationLogEntry[] {
  const runId = snapshot?.runs[selectedRunIndex]?.runId;
  return logs
    .filter(
      (entry) =>
        ["debug", "info", "warn", "error"].indexOf(entry.level) >=
        minimumLogLevel,
    )
    .filter(
      (entry) =>
        !currentRunOnly ||
        (runId !== undefined && entry.context.runId === runId),
    );
}
