import { Box, Text, useApp, useInput } from "ink";
import React from "react";
import type {
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
    void application.getSnapshot().then(setSnapshot);
    return application.subscribe(setSnapshot);
  }, [application]);
  useInput((value, key) => {
    if (key.escape || (key.ctrl && value === "c")) {
      exit();
      return;
    }
    if (approval && (value === "a" || value === "r")) {
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
    if ((key.return || value === "\r" || value === "\n") && input.trim()) {
      const task = input;
      setInput("");
      void application
        .dispatch({
          type: "submit",
          workspaceId: "default",
          conversationId: "default",
          body: task,
        })
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
          <Text color="cyan">Workspace</Text>
          <Text>default</Text>
          {snapshot?.participants.map((participant) => (
            <Text key={participant.id}>
              {participant.kind}: {participant.name}
            </Text>
          ))}
        </Box>
        <Box width="50%" flexDirection="column">
          <Text color="green">Conversation</Text>
          {snapshot?.messages.map((message) => (
            <Text key={message.id}>
              {message.senderId}: {message.body}
            </Text>
          ))}
        </Box>
        <Box width="25%" flexDirection="column">
          <Text color="yellow">Runs</Text>
          {snapshot?.runs.map((run) => (
            <Text key={run.runId}>
              {run.runId.slice(0, 12)} {run.status}
            </Text>
          ))}
        </Box>
      </Box>
      <Text color="gray">&gt; {input}</Text>
      {approval ? (
        <Text color="yellow">
          Approval required: press a to approve or r to reject
        </Text>
      ) : null}
      {error ? <Text color="red">Error: {error}</Text> : null}
    </Box>
  );
}
