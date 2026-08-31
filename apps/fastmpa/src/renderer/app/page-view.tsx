import type {
  ApplicationEvent,
  ApplicationSnapshot,
} from "../../shared/contracts/application.js";
import type { DesktopInfo } from "../../shared/desktop-api.js";
import { AgentsPage } from "../features/agents/agents-page.js";
import { LogsPage } from "../features/logs/logs-page.js";
import { RunsPage } from "../features/runs/runs-page.js";
import { SchedulesPage } from "../features/schedules/schedules-page.js";
import { SettingsPage } from "../features/settings/settings-page.js";

interface PageViewProps {
  readonly page: string;
  readonly snapshot?: ApplicationSnapshot;
  readonly events: readonly ApplicationEvent[];
  readonly desktopInfo?: DesktopInfo;
  readonly workspaceId?: string;
  readonly onRunSelect?: (runId: string) => void;
}

export function PageView({
  page,
  snapshot,
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
    return (
      <RunsPage
        runs={snapshot?.runs ?? []}
        events={events}
        onRunSelect={onRunSelect}
      />
    );
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
