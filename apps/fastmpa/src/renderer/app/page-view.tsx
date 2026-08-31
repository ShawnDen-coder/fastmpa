import type { ApplicationEvent } from "../../shared/contracts/application.js";
import type {
  RunSnapshot,
  ShellSnapshot,
} from "../../shared/contracts/snapshot.js";
import type { DesktopInfo } from "../../shared/desktop-api.js";
import { AgentsPage } from "../features/agents/agents-page.js";
import { LogsPage } from "../features/logs/logs-page.js";
import { RunsPage } from "../features/runs/runs-page.js";
import { SchedulesPage } from "../features/schedules/schedules-page.js";
import { SettingsPage } from "../features/settings/settings-page.js";

interface PageViewProps {
  readonly page: string;
  readonly snapshot?: ShellSnapshot;
  readonly runs: readonly NonNullable<RunSnapshot["run"]>[];
  readonly events: readonly ApplicationEvent[];
  readonly desktopInfo?: DesktopInfo;
  readonly workspaceId?: string;
  readonly onRunSelect?: (runId: string) => void;
}

export function PageView({
  page,
  snapshot,
  runs,
  events,
  desktopInfo,
  workspaceId,
  onRunSelect,
}: PageViewProps): React.JSX.Element {
  if (page === "Agents")
    return (
      <AgentsPage
        workspaceId={workspaceId}
        participants={snapshot?.participants ?? []}
      />
    );
  if (page === "Runs")
    return <RunsPage runs={runs} events={events} onRunSelect={onRunSelect} />;
  if (page === "Schedules")
    return (
      <SchedulesPage
        workspaceId={workspaceId}
        agents={(snapshot?.participants ?? []).filter(
          (participant) => participant.kind === "agent",
        )}
        schedules={snapshot?.schedules ?? []}
      />
    );
  if (page === "Logs") return <LogsPage />;
  return <SettingsPage desktopInfo={desktopInfo} />;
}
