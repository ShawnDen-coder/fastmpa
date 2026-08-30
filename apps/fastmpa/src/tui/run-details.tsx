import type { AgentRun } from "@shawnden-coder/agent-runtime";
import { Box, Text } from "ink";
import type React from "react";

export function RunDetails({
  run,
}: {
  readonly run: AgentRun;
}): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow">
      <Text color="yellow">Run Details</Text>
      <Text>ID: {run.runId}</Text>
      <Text>
        Status: {run.status} · Attempt: {run.attempt}
      </Text>
      <Text>Created: {run.createdAt}</Text>
      {run.error ? (
        <Text color="red">
          {run.error.name}: {run.error.message}
        </Text>
      ) : null}
    </Box>
  );
}
