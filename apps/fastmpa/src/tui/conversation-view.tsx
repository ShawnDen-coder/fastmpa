import { Box, Text } from "ink";
import type React from "react";
import type { Message } from "workspace";
import { InlineTool } from "./inline-tool.js";

export function ConversationView({
  messages,
  streamingText,
  liveTool,
}: {
  readonly messages: readonly Message[];
  readonly streamingText: string;
  readonly liveTool?: string;
}): React.ReactElement {
  return (
    <Box width="50%" flexDirection="column">
      <Text color="green">Continuous Conversation</Text>
      {messages.map((message) => (
        <Text key={message.id}>
          {message.senderId}: {message.body}
        </Text>
      ))}
      {liveTool ? <InlineTool toolName={liveTool} status="running" /> : null}
      {streamingText ? <Text color="green">{streamingText}</Text> : null}
    </Box>
  );
}
