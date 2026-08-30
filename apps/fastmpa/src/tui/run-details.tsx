import type { AgentRun } from "@shawnden-coder/agent-runtime";
import { Box, Text } from "ink";
import type React from "react";
import { tuiLayout } from "./terminal-layout.js";

export function RunDetails({
  run,
}: {
  readonly run: AgentRun;
}): React.ReactElement {
  const layout = tuiLayout(Number(process.stdout.columns ?? 80));
  const toolCalls = (run.result?.messages ?? [])
    .flatMap((message) => message.toolCalls ?? [])
    .map((call) => `${call.id} (${call.name})`);
  const details =
    typeof run.error?.details === "object" && run.error.details !== null
      ? (run.error.details as { approvalId?: unknown })
      : undefined;
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow">
      <Text color="yellow">Run Details</Text>
      <Text>ID: {run.runId}</Text>
      <Text>
        Status: {run.status} · Attempt: {run.attempt}
      </Text>
      {layout.showSecondaryMetadata ? (
        <Text>Created: {run.createdAt}</Text>
      ) : null}
      {layout.showSecondaryMetadata && run.startedAt ? (
        <Text>Started: {run.startedAt}</Text>
      ) : null}
      {layout.showSecondaryMetadata && run.finishedAt ? (
        <Text>Finished: {run.finishedAt}</Text>
      ) : null}
      {layout.showRunContext && run.context ? (
        <Text>
          Workspace: {run.context.workspaceId} · Conversation:{" "}
          {run.context.conversationId ?? "-"}
        </Text>
      ) : null}
      {layout.showSecondaryMetadata && toolCalls.length > 0 ? (
        <Text>Tool Calls: {toolCalls.join(", ")}</Text>
      ) : null}
      {run.error ? (
        <Text color="red">
          {run.error.name}: {run.error.message} · code={run.error.code ?? "-"} ·
          retryable={String(run.error.retryable ?? false)}
        </Text>
      ) : null}
      {typeof details?.approvalId === "string" ? (
        <Text>Approval: {details.approvalId}</Text>
      ) : null}
      <Text color="gray">
        Actions: Ctrl+A Approve · Ctrl+X Reject/Cancel · Esc Close
      </Text>
    </Box>
  );
}
