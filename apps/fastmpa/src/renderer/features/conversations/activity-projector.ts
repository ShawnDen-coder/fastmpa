import type { ApplicationEvent } from "../../../shared/contracts/application.js";
import type {
  ConversationSnapshot,
  PersistedRuntimeEvent,
} from "../../../shared/contracts/snapshot.js";

export type ConversationActivity =
  | {
      readonly kind: "message";
      readonly key: string;
      readonly value: ConversationSnapshot["messages"][number];
    }
  | {
      readonly kind: "route";
      readonly key: string;
      readonly value: ConversationSnapshot["dispatches"][number];
    }
  | {
      readonly kind: "run";
      readonly key: string;
      readonly value: ConversationSnapshot["runs"][number];
    }
  | {
      readonly kind: "event";
      readonly key: string;
      readonly value: PersistedRuntimeEvent | ApplicationEvent;
    };

/** Projects durable facts first and overlays live observations without duplicates. */
export function projectConversationActivity(
  snapshot: ConversationSnapshot,
  liveEvents: readonly ApplicationEvent[] = [],
): readonly ConversationActivity[] {
  const output: ConversationActivity[] = [];
  const seen = new Set<string>();
  const add = (item: ConversationActivity): void => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    output.push(item);
  };
  const messages = [...snapshot.messages].sort(
    (a, b) => a.sequence - b.sequence,
  );
  for (const message of messages)
    add({ kind: "message", key: `message:${message.id}`, value: message });
  for (const dispatch of snapshot.dispatches) {
    add({ kind: "route", key: `route:${dispatch.messageId}`, value: dispatch });
    for (const run of snapshot.runs.filter(
      (candidate) => candidate.context?.sourceRef?.id === dispatch.messageId,
    ))
      add({ kind: "run", key: `run:${run.runId}`, value: run });
  }
  for (const event of [...snapshot.events].sort(
    (a, b) => a.sequence - b.sequence,
  ))
    add({
      kind: "event",
      key: `event:${event.runId}:${event.sequence}`,
      value: event,
    });
  for (const event of liveEvents) {
    const data =
      "data" in event && typeof event.data === "object" && event.data !== null
        ? (event.data as Record<string, unknown>)
        : undefined;
    const toolCallId =
      typeof data?.toolCallId === "string" ? data.toolCallId : "";
    add({
      kind: "event",
      key: `live:${event.runId}:${event.type}:${toolCallId}`,
      value: event,
    });
  }
  return output;
}
