import { Box, Text, useApp, useInput } from "ink";
import React from "react";
import type {
  ApplicationEvent,
  ApplicationLogEntry,
  ApplicationSnapshot,
  FastMpaApplication,
} from "../application.js";

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
  const [streamingText, setStreamingText] = React.useState("");
  const [liveTool, setLiveTool] = React.useState<string>();
  const [focus, setFocus] = React.useState<
    "left" | "middle" | "right" | "logs"
  >("middle");
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    React.useState<string>();
  const [selectedConversationId, setSelectedConversationId] =
    React.useState<string>();
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [minimumLogLevel, setMinimumLogLevel] = React.useState(0);
  const [currentRunOnly, setCurrentRunOnly] = React.useState(false);
  const [confirmExit, setConfirmExit] = React.useState(false);
  const [selectedRunIndex, setSelectedRunIndex] = React.useState(0);
  const [logOffset, setLogOffset] = React.useState(0);
  const [logFollow, setLogFollow] = React.useState(true);
  const [dialog, setDialog] = React.useState<
    "workspace" | "conversation" | "rename" | undefined
  >();
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
    void application.getSnapshot().then((next) => {
      setSnapshot(next);
      setSelectedWorkspaceId(next.selectedWorkspaceId ?? workspaceId(next));
      setSelectedConversationId(
        next.selectedConversationId ?? next.conversations[0]?.id,
      );
    });
    setLogs(application.getRecentLogs(100));
    const unsubscribeSnapshot = application.subscribe(setSnapshot);
    const unsubscribeLogs = application.subscribeLogs((entry) =>
      setLogs((current) => [...current.slice(-99), entry]),
    );
    const unsubscribeEvents = application.subscribeEvents((event) => {
      if (!isSelectedEvent(event, selectedWorkspaceId, selectedConversationId))
        return;
      if (event.type === "text.delta")
        setStreamingText((current) => current + event.delta);
      else if (event.type === "tool.started") setLiveTool(event.toolName);
      else if (event.type === "tool.completed") setLiveTool(undefined);
      else if (event.type === "turn.completed") {
        setStreamingText("");
        setLiveTool(undefined);
      }
    });
    return () => {
      unsubscribeSnapshot();
      unsubscribeLogs();
      unsubscribeEvents();
    };
  }, [application, selectedWorkspaceId, selectedConversationId]);
  const refreshSelection = React.useCallback(
    (workspaceId: string, conversationId?: string) => {
      setSelectedWorkspaceId(workspaceId);
      setSelectedConversationId(conversationId);
      void application
        .getSnapshot({ workspaceId, conversationId })
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
      if (value === "w" || value === "c" || value === "r") {
        setFocus(value === "w" ? "left" : value === "c" ? "middle" : "right");
        setCommandPalette(false);
        return;
      }
      if (value === "n") {
        setDialog(focus === "left" ? "workspace" : "conversation");
        setCommandPalette(false);
        setInput("");
        return;
      }
      return;
    }
    if (key.ctrl && value === "k") {
      setCommandPalette(true);
      return;
    }
    if (key.ctrl && value === "l") {
      setLogsVisible((visible) => !visible);
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
      } else if (logsVisible) setLogsVisible(false);
      else exit();
      return;
    }
    if (key.ctrl && value === "c") {
      const activeRun = snapshot?.runs.find(
        (run) => run.status === "running" || run.status === "queued",
      );
      if (activeRun) {
        void application.dispatch({ type: "cancel", runId: activeRun.runId });
      } else if (queuedCount > 0) {
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
      setQueuedCount((count) => count + 1);
      void application
        .dispatch({
          type: "submit",
          workspaceId: selectedWorkspaceId ?? "default",
          conversationId: selectedConversationId ?? "default",
          body: task,
        })
        .finally(() => setQueuedCount((count) => Math.max(0, count - 1)))
        .then(() => setError(undefined))
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason)),
        );
    } else if (key.backspace) setInput((current) => current.slice(0, -1));
    else if (!key.ctrl && !key.meta && value)
      setInput((current) => current + value);
  });
  return (
    <Box flexDirection="column">
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
        <Box width="50%" flexDirection="column">
          <Text color="green">
            Continuous Conversation [{focus === "middle" ? "focus" : ""}]
          </Text>
          {snapshot?.messages.map((message) => (
            <Text key={message.id}>
              {message.senderId}: {message.body}
            </Text>
          ))}
          {liveTool ? <Text color="cyan">● {liveTool}…</Text> : null}
          {streamingText ? <Text color="green">{streamingText}</Text> : null}
        </Box>
        <Box width="25%" flexDirection="column">
          <Text color="yellow">
            Runs / Approval / Schedule [{focus === "right" ? "focus" : ""}]
          </Text>
          {snapshot?.runs.map((run, index) => (
            <Text
              key={run.runId}
              color={index === selectedRunIndex ? "yellow" : undefined}
            >
              {run.runId.slice(0, 12)} {run.status}
            </Text>
          ))}
          {snapshot?.schedules.map((schedule) => (
            <Text key={schedule.id}>schedule {schedule.id.slice(0, 12)}</Text>
          ))}
        </Box>
      </Box>
      {logsVisible ? (
        <Box flexDirection="column" borderStyle="single" borderColor="gray">
          <Text color="gray">
            Live Logs {application.getLogPath()} [on]
            {focus === "logs" ? " [focus]" : ""}
            {logFollow ? " [follow]" : " [paused]"}
            {currentRunOnly ? " [current run]" : ""}
          </Text>
          {(() => {
            const filtered = filteredLogEntries(
              logs,
              minimumLogLevel,
              currentRunOnly,
              snapshot,
              selectedRunIndex,
            );
            const end = Math.max(0, filtered.length - logOffset);
            return filtered.slice(Math.max(0, end - 8), end).map((entry) => (
              <Text
                key={entry.sequence}
                color={
                  entry.level === "error"
                    ? "red"
                    : entry.level === "warn"
                      ? "yellow"
                      : "gray"
                }
              >
                {entry.timestamp} {entry.component}: {entry.message}
              </Text>
            ));
          })()}
        </Box>
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
      <Text color="gray">
        {selectedWorkspaceId ?? "default"} /{" "}
        {selectedConversationId ?? "default"} ·{" "}
        {composerStatus(snapshot, queuedCount, Boolean(error))}
        {"\n"}&gt; {input}
      </Text>
      {approval ? (
        <Text color="yellow">
          Approval required: Ctrl+A approve, Ctrl+X reject
        </Text>
      ) : null}
      {error ? <Text color="red">Error: {error}</Text> : null}
      {confirmExit ? (
        <Text color="yellow">
          Unsent messages are queued locally and will be lost. Exit? [y/N]
        </Text>
      ) : null}
      {commandPalette ? (
        <Text color="cyan">
          Commands: [w] Workspace [c] Conversation [r] Runs [l] Logs [n] New
          item [Esc/Ctrl+K] Close
        </Text>
      ) : null}
    </Box>
  );
}

function isSelectedEvent(
  event: ApplicationEvent,
  workspaceId: string | undefined,
  conversationId: string | undefined,
): boolean {
  return (
    event.context?.workspaceId === workspaceId &&
    event.context?.conversationId === conversationId
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
