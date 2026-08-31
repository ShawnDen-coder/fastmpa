import type { ConversationSummary } from "../../../shared/contracts/snapshot.js";

export function ConversationHeader({
  conversation,
  participantCount,
  inspectorOpen,
  canOpenInspector,
  onToggleInspector,
  onOpenMembers,
}: {
  readonly conversation?: ConversationSummary;
  readonly participantCount: number;
  readonly inspectorOpen: boolean;
  readonly canOpenInspector: boolean;
  readonly onToggleInspector: () => void;
  readonly onOpenMembers: () => void;
}): React.JSX.Element {
  const kind = conversation?.kind === "group" ? "群聊" : "私聊";
  return (
    <header className="chat-header workbench-conversation-header">
      <div>
        <p className="eyebrow">{kind}</p>
        <h2>{conversation?.title ?? "选择一个对话"}</h2>
        {conversation && <small>{participantCount} 位参与者</small>}
      </div>
      <div className="conversation-header-actions">
        {conversation && (
          <span className="status-pill">
            <span />
            {conversation.activeRunStatus ??
              (conversation.unread ? "等待处理" : "空闲")}
          </span>
        )}
        {conversation?.kind === "group" && (
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenMembers}
          >
            成员
          </button>
        )}
        <button
          type="button"
          className="secondary-button"
          disabled={!canOpenInspector}
          onClick={onToggleInspector}
        >
          {inspectorOpen ? "隐藏运行详情" : "查看运行详情"}
        </button>
      </div>
    </header>
  );
}
