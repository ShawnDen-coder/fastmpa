import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { ApplicationEvent } from "../../../shared/contracts/application.js";
import type {
  ConversationSnapshot,
  PersistedRuntimeEvent,
} from "../../../shared/contracts/snapshot.js";
import type { ParticipantDto } from "../../../shared/contracts/workspace.js";
import { ToolEventCard } from "../../components/ui/tool-event-card.js";
import { MessageRow } from "../../components/workbench/message-row.js";
import {
  type ConversationActivity,
  projectConversationActivity,
} from "./activity-projector.js";

type TimelineItem =
  | ConversationActivity
  | { readonly kind: "streaming"; readonly value: string }
  | {
      readonly kind: "failed";
      readonly value: NonNullable<ConversationSnapshot["runs"][number]>;
    };

export function ConversationTimeline({
  messages,
  messageListRef,
  messagesAtLatest,
  onMessagesAtLatestChange,
  toolEvents,
  persistedEvents,
  streamingText,
  failedRun,
  onRunSelect,
  onApprove,
  onReject,
  onRetry,
  participants,
}: {
  readonly messages: ConversationSnapshot["messages"];
  readonly messageListRef: React.RefObject<VirtuosoHandle | null>;
  readonly messagesAtLatest: boolean;
  readonly onMessagesAtLatestChange: (atLatest: boolean) => void;
  readonly toolEvents: readonly ApplicationEvent[];
  readonly persistedEvents: readonly PersistedRuntimeEvent[];
  readonly streamingText: string;
  readonly failedRun?: NonNullable<ConversationSnapshot["runs"][number]>;
  readonly onRunSelect: (runId: string) => void;
  readonly onApprove: (runId: string, approvalId: string) => void;
  readonly onReject: (runId: string, approvalId: string) => void;
  readonly onRetry: (runId: string, approvalId: string) => void;
  readonly participants: readonly ParticipantDto[];
}): React.JSX.Element {
  const projected = projectConversationActivity(
    {
      conversation: undefined,
      messages,
      runs: [],
      dispatches: [],
      events: persistedEvents,
    },
    toolEvents,
  );
  const items: readonly TimelineItem[] = [
    ...projected,
    ...(streamingText
      ? [{ kind: "streaming" as const, value: streamingText }]
      : []),
    ...(failedRun?.error
      ? [{ kind: "failed" as const, value: failedRun }]
      : []),
  ];
  return (
    <div className="message-list">
      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✦</div>
          <h3>Start a conversation</h3>
          <p>Send a message to begin a durable FastMPA run.</p>
        </div>
      ) : (
        <Virtuoso
          ref={messageListRef}
          data={items}
          followOutput={messagesAtLatest ? "smooth" : false}
          atBottomStateChange={onMessagesAtLatestChange}
          itemContent={(_index, item) => {
            if (item.kind === "message")
              return (
                <MessageRow
                  message={item.value}
                  participant={participants.find(
                    (participant) => participant.id === item.value.senderId,
                  )}
                />
              );
            if (item.kind === "route")
              return (
                <div className="tool-card persisted-event">
                  <span>路由结果</span>
                  <strong>{item.value.status}</strong>
                  <small>{item.value.assignments.length} 个 Agent</small>
                </div>
              );
            if (item.kind === "run")
              return (
                <button
                  type="button"
                  className="tool-card persisted-event"
                  onClick={() => onRunSelect(item.value.runId)}
                >
                  <span>运行摘要</span>
                  <strong>{item.value.status}</strong>
                  <small>{item.value.runId.slice(0, 8)}</small>
                </button>
              );
            if (item.kind === "event") {
              if (!("sequence" in item.value))
                return (
                  <ToolEventCard
                    event={item.value}
                    onDetails={onRunSelect}
                    onApprove={onApprove}
                    onReject={onReject}
                    onRetry={(runId) => onRetry(runId, "")}
                  />
                );
              return (
                <div className="tool-card persisted-event">
                  <span>活动</span>
                  <strong>{item.value.type}</strong>
                  <small>
                    {"occurredAt" in item.value
                      ? item.value.occurredAt
                      : "实时"}
                  </small>
                </div>
              );
            }
            if (item.kind === "streaming")
              return (
                <article className="message streaming">
                  <div className="avatar">A</div>
                  <div>
                    <div className="message-meta">Agent · streaming</div>
                    <p>{item.value}</p>
                  </div>
                </article>
              );
            return (
              <article className="message error-message" role="alert">
                <div className="avatar">!</div>
                <div>
                  <div className="message-meta">Run failed</div>
                  <p>{item.value.error?.message}</p>
                  <div className="run-actions">
                    {item.value.error?.retryable !== false && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          void window.fastMpa.application.dispatch({
                            type: "retry",
                            runId: item.value.runId,
                          })
                        }
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onRunSelect(item.value.runId)}
                    >
                      Details
                    </button>
                  </div>
                </div>
              </article>
            );
          }}
        />
      )}
      {!messagesAtLatest && messages.length > 0 && (
        <button
          type="button"
          className="back-latest-button"
          onClick={() => {
            messageListRef.current?.scrollToIndex({
              index: "LAST",
              behavior: "smooth",
            });
            onMessagesAtLatestChange(true);
          }}
        >
          Back to latest
        </button>
      )}
    </div>
  );
}
