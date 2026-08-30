import { Box, Text } from "ink";
import type React from "react";
import type {
  ApplicationLogEntry,
  ApplicationSnapshot,
} from "../application.js";

export function LogView({
  entries,
  snapshot,
  path,
  minimumLevel,
  currentRunOnly,
  selectedRunIndex,
  offset,
  follow,
  workspaceId,
  conversationId,
  componentFilter,
}: {
  readonly entries: readonly ApplicationLogEntry[];
  readonly snapshot?: ApplicationSnapshot;
  readonly path: string;
  readonly minimumLevel: number;
  readonly currentRunOnly: boolean;
  readonly selectedRunIndex: number;
  readonly offset: number;
  readonly follow: boolean;
  readonly workspaceId?: string;
  readonly conversationId?: string;
  readonly componentFilter?: string;
}): React.ReactElement {
  const runId = snapshot?.runs[selectedRunIndex]?.runId;
  const filtered = entries
    .filter(
      (entry) =>
        ["debug", "info", "warn", "error"].indexOf(entry.level) >= minimumLevel,
    )
    .filter(
      (entry) =>
        entry.context.workspaceId === workspaceId ||
        entry.context.workspaceId === undefined,
    )
    .filter(
      (entry) =>
        entry.context.conversationId === conversationId ||
        entry.context.conversationId === undefined,
    )
    .filter(
      (entry) =>
        !currentRunOnly ||
        (runId !== undefined && entry.context.runId === runId),
    );
  const componentFiltered = componentFilter
    ? filtered.filter((entry) => entry.component === componentFilter)
    : filtered;
  const end = Math.max(0, componentFiltered.length - offset);
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray">
      <Text color="gray">
        Logs · {path} · {follow ? "follow" : "paused"} · component:{" "}
        {componentFilter ?? "all"}
      </Text>
      {componentFiltered.slice(Math.max(0, end - 16), end).map((entry) => (
        <Text
          key={entry.sequence}
          color={
            entry.level === "error"
              ? "red"
              : entry.level === "warn"
                ? "yellow"
                : "gray"
          }
        >
          {entry.timestamp} {entry.component}: {entry.message}
        </Text>
      ))}
    </Box>
  );
}
