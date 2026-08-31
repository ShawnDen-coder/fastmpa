import type { WorkbenchPage } from "./types.js";

const pages: readonly {
  readonly id: WorkbenchPage;
  readonly label: string;
  readonly icon: string;
}[] = [
  { id: "Conversations", label: "对话", icon: "对" },
  { id: "Agents", label: "Agents", icon: "A" },
  { id: "Runs", label: "Runs", icon: "R" },
  { id: "Schedules", label: "Schedules", icon: "S" },
  { id: "Logs", label: "Logs", icon: "L" },
  { id: "Settings", label: "设置", icon: "设" },
];

export function NavigationRail({
  activePage,
  attentionCount = 0,
  onPageChange,
}: {
  readonly activePage: WorkbenchPage;
  readonly attentionCount?: number;
  readonly onPageChange: (page: WorkbenchPage) => void;
}): React.JSX.Element {
  return (
    <nav className="rail" aria-label="主导航">
      <div className="rail-logo" title="FastMPA">
        F
      </div>
      {pages.map((page) => (
        <button
          type="button"
          className={activePage === page.id ? "rail-item active" : "rail-item"}
          key={page.id}
          aria-current={activePage === page.id ? "page" : undefined}
          title={page.label}
          onClick={() => onPageChange(page.id)}
        >
          {page.icon}
          {page.id === "Conversations" && attentionCount > 0 && (
            <span className="rail-badge" title={`${attentionCount} 项待处理`}>
              {attentionCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
