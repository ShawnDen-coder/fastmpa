import type { DesktopInfo } from "../../../shared/desktop-api.js";
import { InfoCard } from "../../components/ui/info-card.js";

export function SettingsPage({
  desktopInfo,
}: {
  readonly desktopInfo?: DesktopInfo;
}): React.JSX.Element {
  return (
    <div className="settings-grid">
      <InfoCard
        label="Model"
        value={desktopInfo?.model ?? "Loading"}
        detail="Configured in the Main process"
      />
      <InfoCard
        label="Database"
        value="SQLite"
        detail="Stored in the FastMPA user data directory"
      />
      <InfoCard
        label="Version"
        value={desktopInfo?.version ?? "Loading"}
        detail={
          desktopInfo
            ? `${desktopInfo.platform} · ${desktopInfo.arch}`
            : "FastMPA Desktop"
        }
      />
      <InfoCard label="Log level" value={desktopInfo?.logLevel ?? "Loading"} />
      <InfoCard
        label="Database path"
        value={desktopInfo?.databasePath ?? "Loading"}
      />
      <InfoCard label="Log path" value={desktopInfo?.logPath ?? "Loading"} />
      <div className="settings-action">
        <button
          type="button"
          className="secondary-button"
          onClick={() => void window.fastMpa.desktop.revealDataDirectory()}
        >
          Open data directory
        </button>
      </div>
    </div>
  );
}
