import { Box, Text } from "ink";
import type React from "react";

export function CommandPalette({
  hasFailedDraft = false,
}: {
  readonly hasFailedDraft?: boolean;
}): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="cyan" flexDirection="column">
      <Text color="cyan">Commands</Text>
      <Text>[w] Workspace [c] Conversation [r] Runs [l] Logs</Text>
      <Text>[n] New Workspace/Conversation [Esc/Ctrl+K] Close</Text>
      <Text>Switch Agent · Show Schedules · Show Attention</Text>
      {hasFailedDraft ? (
        <Text color="yellow">[y] Retry [e] Edit [d] Discard</Text>
      ) : null}
    </Box>
  );
}
