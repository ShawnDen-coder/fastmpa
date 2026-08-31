import type { ShellSnapshot } from "../../../shared/contracts/snapshot.js";

export function ConversationList({
  workspace,
  conversations,
  participants,
  selectedConversationId,
  search,
  agentFilter,
  onSearchChange,
  onAgentFilterChange,
  onConversationSelect,
  onCreateConversation,
}: {
  readonly workspace?: ShellSnapshot["workspaces"][number];
  readonly conversations: ShellSnapshot["conversations"];
  readonly participants: ShellSnapshot["participants"];
  readonly selectedConversationId?: string;
  readonly search: string;
  readonly agentFilter: string;
  readonly onSearchChange: (value: string) => void;
  readonly onAgentFilterChange: (value: string) => void;
  readonly onConversationSelect: (conversationId: string) => void;
  readonly onCreateConversation: () => void;
}): React.JSX.Element {
  const agents = participants.filter(
    (participant) =>
      participant.workspaceId === workspace?.id && participant.kind === "agent",
  );
  const visibleConversations = conversations.filter(
    (conversation) =>
      conversation.workspaceId === workspace?.id &&
      (agentFilter === "all" ||
        conversation.participantIds.includes(agentFilter)) &&
      (conversation.title ?? "Untitled conversation")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <aside className="conversation-list">
      <div className="pane-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>{workspace?.name ?? "FastMPA"}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          title="New conversation"
          onClick={onCreateConversation}
        >
          +
        </button>
      </div>
      <input
        className="search-input"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search conversations"
        aria-label="Search conversations"
      />
      <select
        className="search-input agent-filter"
        value={agentFilter}
        onChange={(event) => onAgentFilterChange(event.target.value)}
        aria-label="Filter conversations by agent"
      >
        <option value="all">All agents</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <div className="conversation-items">
        {visibleConversations.map((conversation) => {
          const status =
            conversation.activeRunStatus ??
            (conversation.unread ? "waiting" : "active");
          return (
            <button
              type="button"
              className={
                conversation.id === selectedConversationId
                  ? "conversation-item selected"
                  : "conversation-item"
              }
              key={conversation.id}
              onClick={() => onConversationSelect(conversation.id)}
            >
              <span className="conversation-dot" />
              <span>
                <strong>{conversation.title ?? "Untitled conversation"}</strong>
                <small>
                  {conversation.lastMessagePreview ?? "No messages yet"}
                </small>
              </span>
              <span
                className={`conversation-status status-${status}`}
                title={status}
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
