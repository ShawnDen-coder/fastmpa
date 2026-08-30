import { Text } from "ink";
import type React from "react";

export function StatusBar({
  workspace,
  conversation,
  agent,
  status,
}: {
  readonly workspace: string;
  readonly conversation: string;
  readonly agent: string;
  readonly status: string;
}): React.ReactElement {
  return (
    <Text color="gray">
      {workspace} / {conversation} / {agent} · {status}
      {"\n"}Ctrl+K Commands · Ctrl+L Logs
    </Text>
  );
}
