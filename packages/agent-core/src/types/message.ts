import type { ToolCall } from "./tool";

/** The participants that can contribute to a model context. */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** A single ordered message in a Turn context. */
export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
  readonly toolCalls?: readonly ToolCall[];
}
