import { Text } from "ink";
import type React from "react";

export function InlineTool({
  toolName,
  status,
  summary,
}: {
  readonly toolName: string;
  readonly status: "running" | "waiting" | "completed" | "failed";
  readonly summary?: string;
}): React.ReactElement {
  const marker =
    status === "running"
      ? "●"
      : status === "waiting"
        ? "◆"
        : status === "failed"
          ? "!"
          : "✓";
  return (
    <Text
      color={status === "failed" || status === "waiting" ? "yellow" : "cyan"}
    >
      {marker} {toolName} {status === "running" ? "…" : (summary ?? status)}
    </Text>
  );
}
