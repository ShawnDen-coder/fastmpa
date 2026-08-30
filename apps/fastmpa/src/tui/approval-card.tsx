import { Text } from "ink";
import type React from "react";

export function ApprovalCard({
  toolName,
  approvalId,
}: {
  readonly toolName: string;
  readonly approvalId: string;
}): React.ReactElement {
  return (
    <Text color="yellow">
      ◆ {toolName} · approval required ({approvalId}){"\n"} [Ctrl+A] Approve ·
      [Ctrl+X] Reject
    </Text>
  );
}
