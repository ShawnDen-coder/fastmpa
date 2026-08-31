import { useState } from "react";
import type { ApplicationSnapshot } from "../../../shared/contracts/application.js";
import { InfoCard } from "../../components/ui/info-card.js";

export function AgentsPage({
  workspaceId,
  participants,
}: {
  readonly workspaceId?: string;
  readonly participants: readonly ApplicationSnapshot["participants"][number][];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string>();
  const [name, setName] = useState("");
  const [modelKey, setModelKey] = useState("demo");
  const [role, setRole] = useState("assistant");
  const [persona, setPersona] = useState("You are a helpful FastMPA agent.");
  const [capabilities, setCapabilities] = useState("");
  const [toolNames, setToolNames] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const agents = participants.filter(
    (participant) => participant.kind === "agent",
  );
  const openCreate = (): void => {
    setEditingAgentId(undefined);
    setName("");
    setModelKey("demo");
    setRole("assistant");
    setPersona("You are a helpful FastMPA agent.");
    setCapabilities("");
    setToolNames("");
    setError(undefined);
    setOpen(true);
  };
  const openEdit = (
    participant: ApplicationSnapshot["participants"][number],
  ): void => {
    setEditingAgentId(participant.id);
    setName(participant.name);
    setModelKey(participant.agent?.modelKey ?? "demo");
    setRole(participant.agent?.role ?? "assistant");
    setPersona(participant.agent?.persona ?? "");
    setCapabilities(participant.agent?.capabilities.join(", ") ?? "");
    setToolNames(participant.agent?.toolNames.join(", ") ?? "");
    setError(undefined);
    setOpen(true);
  };
  const create = async (): Promise<void> => {
    if (!workspaceId || !name.trim()) return;
    const capabilitiesList = capabilities
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const toolNamesList = toolNames
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setPending(true);
    setError(undefined);
    try {
      await window.fastMpa.application.dispatch({
        ...(editingAgentId
          ? {
              type: "agent.update" as const,
              workspaceId,
              agentId: editingAgentId,
              patch: {
                name: name.trim(),
                modelKey: modelKey.trim() || "demo",
                persona: persona.trim() || "You are a helpful FastMPA agent.",
                role: role.trim() || "assistant",
                capabilities: capabilitiesList,
                toolNames: toolNamesList,
              },
            }
          : {
              type: "agent.create" as const,
              workspaceId,
              input: {
                name: name.trim(),
                modelKey: modelKey.trim() || "demo",
                persona: persona.trim() || "You are a helpful FastMPA agent.",
                role: role.trim() || "assistant",
                capabilities: capabilitiesList,
                toolNames: toolNamesList,
              },
            }),
      });
      setName("");
      setCapabilities("");
      setToolNames("");
      setEditingAgentId(undefined);
      setOpen(false);
    } catch (commandError: unknown) {
      setError(
        commandError instanceof Error
          ? commandError.message
          : "Unable to save Agent",
      );
    } finally {
      setPending(false);
    }
  };
  const toggleStatus = async (
    participant: ApplicationSnapshot["participants"][number],
  ): Promise<void> => {
    setPending(true);
    setError(undefined);
    try {
      await window.fastMpa.application.dispatch({
        type:
          participant.status === "active" ? "agent.archive" : "agent.activate",
        workspaceId: participant.workspaceId,
        agentId: participant.id,
      });
    } catch (commandError: unknown) {
      setError(
        commandError instanceof Error
          ? commandError.message
          : "Unable to update Agent status",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="agent-page">
      <div className="page-toolbar">
        <div>
          <p className="eyebrow">Workspace agents</p>
          <h2>Configure your collaborators</h2>
        </div>
        <button
          type="button"
          className="send-button"
          onClick={openCreate}
          disabled={!workspaceId}
        >
          Add Agent
        </button>
      </div>
      <div className="page-grid">
        {agents.map((participant) => (
          <article className="agent-card" key={participant.id}>
            <InfoCard
              label="Agent"
              value={participant.name}
              detail={
                participant.agent?.modelKey ??
                participant.agent?.model ??
                "Model not configured"
              }
            />
            <p>{participant.agent?.persona ?? "No persona configured"}</p>
            <div className="run-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openEdit(participant)}
              >
                Edit
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void toggleStatus(participant)}
                disabled={pending}
              >
                {participant.status === "active" ? "Archive" : "Activate"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {open && (
        <div className="dialog-backdrop" role="presentation">
          <form
            className="dialog-card agent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <p className="eyebrow">Agent setup</p>
            <h2 id="agent-dialog-title">
              {editingAgentId ? "Edit Agent" : "Add an Agent"}
            </h2>
            {error && (
              <div className="composer-error" role="alert">
                {error}
              </div>
            )}
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Model key
              <input
                value={modelKey}
                onChange={(event) => setModelKey(event.target.value)}
              />
            </label>
            <label>
              Role
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            </label>
            <label>
              Persona
              <textarea
                rows={4}
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
              />
            </label>
            <label>
              Capabilities (comma separated)
              <input
                value={capabilities}
                onChange={(event) => setCapabilities(event.target.value)}
              />
            </label>
            <label>
              Tools (comma separated)
              <input
                value={toolNames}
                onChange={(event) => setToolNames(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="send-button"
                disabled={!name.trim() || pending}
              >
                {pending
                  ? "Saving…"
                  : editingAgentId
                    ? "Save Agent"
                    : "Create Agent"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
