import { Box, Text } from "ink";
import type React from "react";

export function CommandPalette(): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="cyan" flexDirection="column">
      <Text color="cyan">Commands</Text>
      <Text>[w] Workspace [c] Conversation [r] Runs [l] Logs</Text>
      <Text>[n] New Workspace/Conversation [Esc/Ctrl+K] Close</Text>
    </Box>
  );
}
