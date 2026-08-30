import { Box, Text } from "ink";
import type React from "react";
import type { ApplicationSnapshot } from "../application.js";

export type AuxiliaryView = "runs" | "schedules" | "attention";

export function AuxiliaryViewPanel({
  snapshot,
  view,
}: {
  readonly snapshot?: ApplicationSnapshot;
  readonly view: AuxiliaryView;
}): React.ReactElement {
  if (view === "schedules")
    return (
      <Box flexDirection="column">
        <Text color="yellow">Schedules</Text>
        {(snapshot?.schedules ?? []).map((schedule) => (
          <Text key={schedule.id}>
            {schedule.enabled === false ? "○" : "●"} {schedule.id.slice(0, 12)}{" "}
            · every {schedule.intervalMs}ms
          </Text>
        ))}
      </Box>
    );
  if (view === "attention")
    return (
      <Box flexDirection="column">
        <Text color="yellow">Attention</Text>
        <Text>Inbox: {snapshot?.attention?.inbox.length ?? 0}</Text>
        <Text>Agenda: {snapshot?.attention?.agenda.length ?? 0}</Text>
      </Box>
    );
  return (
    <Box flexDirection="column">
      <Text color="yellow">Runs</Text>
      {(snapshot?.runs ?? []).map((run, index) => (
        <Text key={run.runId} color={index === 0 ? "yellow" : undefined}>
          {run.runId.slice(0, 12)} {run.status} · attempt {run.attempt}
        </Text>
      ))}
    </Box>
  );
}
