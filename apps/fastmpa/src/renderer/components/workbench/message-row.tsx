import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  MessageDto,
  ParticipantDto,
} from "../../../shared/contracts/workspace.js";
import { MarkdownPre } from "../ui/markdown-pre.js";
import { AgentIdentity } from "./agent-identity.js";

export function MessageRow({
  message,
  participant,
  isStreaming = false,
}: {
  readonly message: MessageDto;
  readonly participant?: ParticipantDto;
  readonly isStreaming?: boolean;
}): React.JSX.Element {
  const isUser = participant?.kind === "human" || message.senderId === "human";
  const name = participant?.name ?? (isUser ? "当前用户" : "Agent");
  return (
    <article
      className={`message ${isUser ? "user" : ""} ${isStreaming ? "streaming" : ""}`}
    >
      {isUser ? (
        <span className="avatar" aria-hidden="true">
          你
        </span>
      ) : (
        <AgentIdentity name={name} roleLabel={participant?.agent?.role} />
      )}
      <div className="message-content">
        <div className="message-meta">
          {name} · <time dateTime={message.createdAt}>{message.createdAt}</time>
          {isStreaming && " · 正在生成"}
        </div>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ pre: MarkdownPre }}
        >
          {message.body}
        </ReactMarkdown>
      </div>
    </article>
  );
}
