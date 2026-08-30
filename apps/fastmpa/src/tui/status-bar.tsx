import { Text } from "ink";
import type React from "react";

export function StatusBar({
  workspace,
  conversation,
  status,
}: {
  readonly workspace: string;
  readonly conversation: string;
  readonly status: string;
}): React.ReactElement {
  return (
    <Text color="gray">
      {workspace} / {conversation} · {status}
      {"\n"}Ctrl+K Commands · Ctrl+L Logs
    </Text>
  );
}
