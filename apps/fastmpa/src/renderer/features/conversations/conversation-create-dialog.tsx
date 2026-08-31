import { useState } from "react";
import type { ShellSnapshot } from "../../../shared/contracts/snapshot.js";

export function ConversationCreateDialog({
  workspaceId,
  agents,
  onClose,
  onCreated,
}: {
  readonly workspaceId: string;
  readonly agents: ShellSnapshot["participants"];
  readonly onClose: () => void;
  readonly onCreated: (conversationId?: string) => void;
}): React.JSX.Element {
  const activeAgents = agents.filter((agent) => agent.status === "active");
  const [kind, setKind] = useState<"direct" | "group">("direct");
  const [agentId, setAgentId] = useState(activeAgents[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(
    activeAgents[0]?.id ? [activeAgents[0].id] : [],
  );
  const [fallbackAgentId, setFallbackAgentId] = useState(
    activeAgents[0]?.id ?? "",
  );
  const [maxAgents, setMaxAgents] = useState("3");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const toggleAgent = (id: string): void => {
    setSelectedAgentIds((current) => {
      if (!current.includes(id)) return [...current, id];
      const next = current.filter((item) => item !== id);
      if (id === fallbackAgentId) setFallbackAgentId(next[0] ?? "");
      return next;
    });
  };
  const submit = async (): Promise<void> => {
    if (kind === "direct" && !agentId) return;
    if (kind === "group" && (!title.trim() || selectedAgentIds.length === 0))
      return;
    setPending(true);
    setError(undefined);
    try {
      const result = await window.fastMpa.application.dispatch(
        kind === "direct"
          ? { type: "conversation.direct.open", workspaceId, agentId }
          : {
              type: "conversation.group.create",
              workspaceId,
              title: title.trim(),
              agentIds: selectedAgentIds,
              routing: {
                fallbackAgentId: fallbackAgentId || selectedAgentIds[0],
                maxAgents: Math.min(5, Math.max(1, Number(maxAgents) || 3)),
              },
            },
      );
      onCreated(result.conversationId);
    } catch (commandError: unknown) {
      setError(
        commandError instanceof Error
          ? commandError.message
          : "Unable to create conversation",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="dialog-card conversation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-conversation-title"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="eyebrow">New conversation</p>
        <h2 id="create-conversation-title">Start a conversation</h2>
        {error && (
          <div className="composer-error" role="alert">
            {error}
          </div>
        )}
        <div
          className="dialog-tabs"
          role="tablist"
          aria-label="Conversation type"
        >
          <button
            type="button"
            className={kind === "direct" ? "active" : ""}
            onClick={() => setKind("direct")}
          >
            Direct
          </button>
          <button
            type="button"
            className={kind === "group" ? "active" : ""}
            onClick={() => setKind("group")}
          >
            Group
          </button>
        </div>
        {kind === "direct" ? (
          <label>
            Agent
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Group name
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>Agents</legend>
              {activeAgents.map((agent) => (
                <label key={agent.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedAgentIds.includes(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                  />
                  {agent.name}
                </label>
              ))}
            </fieldset>
            <div className="dialog-form-row">
              <label>
                Fallback
                <select
                  value={fallbackAgentId}
                  onChange={(event) => setFallbackAgentId(event.target.value)}
                >
                  {activeAgents
                    .filter((agent) => selectedAgentIds.includes(agent.id))
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Max agents
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={maxAgents}
                  onChange={(event) => setMaxAgents(event.target.value)}
                />
              </label>
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="send-button" disabled={pending}>
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
