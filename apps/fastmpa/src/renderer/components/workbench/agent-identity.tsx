export function AgentIdentity({
  name,
  roleLabel,
  status,
}: {
  readonly name: string;
  readonly roleLabel?: string;
  readonly status?: "active" | "inactive";
}): React.JSX.Element {
  return (
    <div className="workbench-agent-identity">
      <span className="avatar" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span>
        <strong>{name}</strong>
        {roleLabel && <small>{roleLabel}</small>}
      </span>
      {status && (
        <span
          className={`presence-dot presence-${status}`}
          title={status === "active" ? "在线" : "离线"}
        />
      )}
    </div>
  );
}
