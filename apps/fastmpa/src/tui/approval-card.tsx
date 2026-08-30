import { Text } from "ink";
import type React from "react";

export function ApprovalCard({
  toolName,
  approvalId,
  selectedAction = 0,
}: {
  readonly toolName: string;
  readonly approvalId: string;
  readonly selectedAction?: number;
}): React.ReactElement {
  return (
    <Text color="yellow">
      ◆ {toolName} · approval required ({approvalId}){"\n"}{" "}
      {selectedAction === 0 ? "[Approve]" : " Approve "}{" "}
      {selectedAction === 1 ? "[Reject]" : " Reject "}{" "}
      {selectedAction === 2 ? "[Details]" : " Details "} · ←/→ select · Enter
      confirm
    </Text>
  );
}
