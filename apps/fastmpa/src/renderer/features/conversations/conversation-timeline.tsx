import ReactMarkdown from "react-markdown";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import remarkGfm from "remark-gfm";
import type { ApplicationEvent } from "../../../shared/contracts/application.js";
import type {
  ConversationSnapshot,
  PersistedRuntimeEvent,
} from "../../../shared/contracts/snapshot.js";
import { MarkdownPre } from "../../components/ui/markdown-pre.js";
import { ToolEventCard } from "../../components/ui/tool-event-card.js";

type TimelineItem =
  | {
      readonly kind: "message";
      readonly value: ConversationSnapshot["messages"][number];
    }
  | { readonly kind: "tool"; readonly value: ApplicationEvent }
  | { readonly kind: "persisted"; readonly value: PersistedRuntimeEvent }
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
}): React.JSX.Element {
  const items: readonly TimelineItem[] = [
    ...messages.map((value) => ({ kind: "message" as const, value })),
    ...toolEvents.slice(-8).map((value) => ({ kind: "tool" as const, value })),
    ...persistedEvents.map((value) => ({ kind: "persisted" as const, value })),
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
                <article
                  className={
                    item.value.senderId === "human" ? "message user" : "message"
                  }
                  key={item.value.id}
                >
                  <div className="avatar">
                    {item.value.senderId === "human" ? "You" : "A"}
                  </div>
                  <div>
                    <div className="message-meta">
                      {item.value.senderId === "human" ? "You" : "Agent"}
                    </div>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{ pre: MarkdownPre }}
                    >
                      {item.value.body}
                    </ReactMarkdown>
                  </div>
                </article>
              );
            if (item.kind === "tool")
              return (
                <ToolEventCard event={item.value} onDetails={onRunSelect} />
              );
            if (item.kind === "persisted")
              return (
                <div className="tool-card persisted-event">
                  <span>History</span>
                  <strong>{item.value.type}</strong>
                  <small>{item.value.occurredAt}</small>
                </div>
              );
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
