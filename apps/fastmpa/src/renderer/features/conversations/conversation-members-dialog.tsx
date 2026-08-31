import type { ApplicationSnapshot } from "../../../shared/contracts/application.js";

export function ConversationMembersDialog({
  conversation,
  agents,
  onClose,
}: {
  readonly conversation: ApplicationSnapshot["conversations"][number];
  readonly agents: readonly ApplicationSnapshot["participants"][number][];
  readonly onClose: () => void;
}): React.JSX.Element {
  const members = agents.filter((agent) =>
    conversation.participantIds.includes(agent.id),
  );
  const available = agents.filter(
    (agent) =>
      agent.status === "active" &&
      !conversation.participantIds.includes(agent.id),
  );
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-members-title"
      >
        <p className="eyebrow">Group conversation</p>
        <h2 id="conversation-members-title">Manage members</h2>
        <div className="member-list">
          {members.map((agent) => (
            <div className="member-row" key={agent.id}>
              <span>{agent.name}</span>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() =>
                  void window.fastMpa.application
                    .dispatch({
                      type: "conversation.member.remove",
                      workspaceId: conversation.workspaceId,
                      conversationId: conversation.id,
                      agentId: agent.id,
                    })
                    .then(onClose)
                }
              >
                Remove
              </button>
            </div>
          ))}
          {members.length === 0 && <p>No active members.</p>}
        </div>
        {available.length > 0 && (
          <label>
            Add Agent
            <select
              defaultValue=""
              onChange={(event) => {
                const agentId = event.target.value;
                if (!agentId) return;
                void window.fastMpa.application
                  .dispatch({
                    type: "conversation.member.add",
                    workspaceId: conversation.workspaceId,
                    conversationId: conversation.id,
                    agentIds: [agentId],
                  })
                  .then(onClose);
              }}
            >
              <option value="">Select an Agent</option>
              {available.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
