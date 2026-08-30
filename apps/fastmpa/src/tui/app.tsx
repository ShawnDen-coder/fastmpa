import { Box, Text, useApp, useInput } from "ink";
import React from "react";
import type {
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
  const [logsVisible, setLogsVisible] = React.useState(true);
  const [focus, setFocus] = React.useState<"left" | "middle" | "right">(
    "middle",
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    React.useState<string>();
  const [selectedConversationId, setSelectedConversationId] =
    React.useState<string>();
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [dialog, setDialog] = React.useState<
    "workspace" | "conversation" | "rename" | undefined
  >();
  const { exit } = useApp();
  const approval = snapshot?.runs.find((run) => {
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
    setLogs(application.getRecentLogs?.(100) ?? []);
    const unsubscribeSnapshot = application.subscribe(setSnapshot);
    const unsubscribeLogs =
      application.subscribeLogs?.((entry) =>
        setLogs((current) => [...current.slice(-99), entry]),
      ) ?? (() => undefined);
    return () => {
      unsubscribeSnapshot();
      unsubscribeLogs();
    };
  }, [application]);
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
    if (key.ctrl && value === "l") {
      setLogsVisible((visible) => !visible);
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
        const areas = ["left", "middle", "right"] as const;
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
      } else exit();
      return;
    }
    if (key.ctrl && value === "c") {
      const activeRun = snapshot?.runs.find(
        (run) => run.status === "running" || run.status === "queued",
      );
      if (activeRun) {
        void application.dispatch({ type: "cancel", runId: activeRun.runId });
      } else exit();
      return;
    }
    if (approval && key.ctrl && (value === "a" || value === "x")) {
      const details = approval.error?.details as { approvalId: string };
      void application
        .dispatch({
          type: value === "a" ? "approve" : "reject",
          runId: approval.runId,
          approvalId: details.approvalId,
        })
        .then(() => setError(undefined))
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason)),
        );
      return;
    }
    if (key.upArrow || key.downArrow) {
      if (focus === "left") {
        const workspaces = (snapshot?.workspaces ?? []).map((item) =>
          typeof item === "string" ? { id: item, name: item } : item,
        );
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
          setSnapshot(next);
          if (dialog === "workspace") {
            const created = next.workspaces.at(-1);
            const id = typeof created === "string" ? created : created?.id;
            if (id) setSelectedWorkspaceId(id);
          }
          if (dialog === "conversation")
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
            const workspace =
              typeof item === "string" ? { id: item, name: item } : item;
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
        </Box>
        <Box width="25%" flexDirection="column">
          <Text color="yellow">
            Runs / Approval / Schedule [{focus === "right" ? "focus" : ""}]
          </Text>
          {snapshot?.runs.map((run) => (
            <Text key={run.runId}>
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
          <Text color="gray">Live Logs [on]</Text>
          {logs.slice(-8).map((entry) => (
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
          ))}
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
        {queuedCount ? `queued (${queuedCount})` : "ready"}
        {"\n"}&gt; {input}
      </Text>
      {approval ? (
        <Text color="yellow">
          Approval required: Ctrl+A approve, Ctrl+X reject
        </Text>
      ) : null}
      {error ? <Text color="red">Error: {error}</Text> : null}
    </Box>
  );
}

function workspaceId(snapshot: ApplicationSnapshot): string | undefined {
  const first = snapshot.workspaces[0];
  return typeof first === "string" ? first : first?.id;
}
