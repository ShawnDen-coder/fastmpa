import { useEffect, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import type { ApplicationLogEntry } from "../../../shared/contracts/application.js";
import { useLogStore } from "../../stores/index.js";

export function LogsPage(): React.JSX.Element {
  const logs = useLogStore((state) => state.entries);
  const mergeEntries = useLogStore((state) => state.mergeEntries);
  const mergeHistory = useLogStore((state) => state.mergeHistory);
  const level = useLogStore((state) => state.level);
  const workspaceId = useLogStore((state) => state.workspaceId);
  const conversationId = useLogStore((state) => state.conversationId);
  const runId = useLogStore((state) => state.runId);
  const component = useLogStore((state) => state.component);
  const followLatest = useLogStore((state) => state.followLatest);
  const setLevel = useLogStore((state) => state.setLevel);
  const setWorkspaceId = useLogStore((state) => state.setWorkspaceId);
  const setConversationId = useLogStore((state) => state.setConversationId);
  const setRunId = useLogStore((state) => state.setRunId);
  const setComponent = useLogStore((state) => state.setComponent);
  const setFollowLatest = useLogStore((state) => state.setFollowLatest);
  useEffect(() => {
    let active = true;
    void window.fastMpa.application.getRecentLogs(100).then((entries) => {
      if (active) mergeHistory(entries);
    });
    const unsubscribe = window.fastMpa.application.onLogs((entries) => {
      if (active) mergeEntries(entries);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [mergeEntries, mergeHistory]);
  const contextValues = (field: string): string[] =>
    [...new Set(logs.map((entry) => entry.context[field]).filter(Boolean))].map(
      String,
    );
  const filteredLogs = useMemo(
    () =>
      logs.filter((entry) => {
        const context = entry.context;
        return (
          (level === "all" || entry.level === level) &&
          (workspaceId === "all" ||
            String(context.workspaceId) === workspaceId) &&
          (conversationId === "all" ||
            String(context.conversationId) === conversationId) &&
          (runId === "all" || String(context.runId) === runId) &&
          (component === "all" || entry.component === component)
        );
      }),
    [component, conversationId, level, logs, runId, workspaceId],
  );
  const componentValues = contextValues("component");
  useEffect(() => {
    const cycleComponent = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== "v" ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const values = ["all", ...componentValues];
      const index = values.indexOf(component);
      setComponent(values[(index + 1) % values.length] ?? "all");
    };
    window.addEventListener("keydown", cycleComponent);
    return () => window.removeEventListener("keydown", cycleComponent);
  }, [component, componentValues, setComponent]);
  const filter = (
    label: string,
    value: string,
    setValue: (value: string) => void,
    values: readonly string[],
  ): React.JSX.Element => (
    <label>
      {label}
      <select value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="all">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item.slice(0, 12)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="logs-page">
      <div className="logs-toolbar">
        <span>Recent application logs ({filteredLogs.length})</span>
        <div className="log-controls">
          <label>
            Level
            <select
              value={level}
              onChange={(event) =>
                setLevel(
                  event.target.value as "all" | ApplicationLogEntry["level"],
                )
              }
            >
              <option value="all">All</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </label>
          {filter(
            "Workspace",
            workspaceId,
            setWorkspaceId,
            contextValues("workspaceId"),
          )}
          {filter(
            "Conversation",
            conversationId,
            setConversationId,
            contextValues("conversationId"),
          )}
          {filter("Run", runId, setRunId, contextValues("runId"))}
          {filter("Component", component, setComponent, componentValues)}
          <label className="follow-toggle">
            <input
              type="checkbox"
              checked={followLatest}
              onChange={(event) => setFollowLatest(event.target.checked)}
            />
            Follow latest
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void window.fastMpa.desktop.revealLogFile()}
          >
            Open log file
          </button>
        </div>
      </div>
      <div className="log-items">
        <Virtuoso
          data={filteredLogs}
          followOutput={followLatest ? "smooth" : false}
          itemContent={(_index, entry) => (
            <article className={`log-item level-${entry.level}`}>
              <span>{entry.level}</span>
              <strong>{entry.component}</strong>
              <p>{entry.message}</p>
              <time>{entry.timestamp}</time>
            </article>
          )}
        />
      </div>
    </div>
  );
}
