import { Box, Text } from "ink";
import React from "react";
import type { ApplicationSnapshot } from "../application.js";

export function WorkspacePicker({
  snapshot,
  workspaceId,
  conversationId,
}: {
  readonly snapshot?: ApplicationSnapshot;
  readonly workspaceId?: string;
  readonly conversationId?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Workspaces</Text>
      {(snapshot?.workspaces ?? []).map((workspace) => (
        <React.Fragment key={workspace.id}>
          <Text color={workspace.id === workspaceId ? "cyan" : undefined}>
            {workspace.id === workspaceId ? "> " : "  "}
            {workspace.name}
          </Text>
          {workspace.id === workspaceId
            ? snapshot?.conversations.map((conversation) => (
                <Text key={conversation.id}>
                  {conversation.id === conversationId ? "  > " : "    "}
                  {conversation.title ?? conversation.id}
                </Text>
              ))
            : null}
        </React.Fragment>
      ))}
    </Box>
  );
}
