import { create } from "zustand";
import type { ApplicationEvent } from "../../shared/contracts/application.js";
import type { PersistedRuntimeEvent } from "../../shared/contracts/snapshot.js";

export interface RuntimeState {
  readonly events: readonly ApplicationEvent[];
  readonly streamingByConversation: Readonly<Record<string, string>>;
  readonly persistedEventsByConversation: Readonly<
    Record<string, readonly PersistedRuntimeEvent[]>
  >;
  readonly appendEvent: (event: ApplicationEvent) => void;
  readonly mergeEvents: (events: readonly ApplicationEvent[]) => void;
  readonly appendTextDelta: (conversationKey: string, delta: string) => void;
  readonly clearStreaming: (conversationKey: string) => void;
  readonly mergePersistedEvents: (
    conversationKey: string,
    events: readonly PersistedRuntimeEvent[],
  ) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  events: [],
  streamingByConversation: {},
  persistedEventsByConversation: {},
  appendEvent: (event) =>
    set((state) => ({ events: [...state.events.slice(-199), event] })),
  mergeEvents: (events) =>
    set((state) => {
      const nextEvents = [...state.events, ...events].slice(-200);
      const streamingByConversation = { ...state.streamingByConversation };
      for (const event of events) {
        const eventKey =
          event.context?.workspaceId && event.context.conversationId
            ? `${event.context.workspaceId}:${event.context.conversationId}`
            : undefined;
        if (!eventKey) continue;
        if (event.type === "text.delta")
          streamingByConversation[eventKey] =
            (streamingByConversation[eventKey] ?? "") + event.delta;
        if (event.type === "turn.completed")
          delete streamingByConversation[eventKey];
      }
      return { events: nextEvents, streamingByConversation };
    }),
  appendTextDelta: (conversationKey, delta) =>
    set((state) => ({
      streamingByConversation: {
        ...state.streamingByConversation,
        [conversationKey]:
          (state.streamingByConversation[conversationKey] ?? "") + delta,
      },
    })),
  clearStreaming: (conversationKey) =>
    set((state) => {
      const streamingByConversation = { ...state.streamingByConversation };
      delete streamingByConversation[conversationKey];
      return { streamingByConversation };
    }),
  mergePersistedEvents: (conversationKey, events) =>
    set((state) => ({
      persistedEventsByConversation: {
        ...state.persistedEventsByConversation,
        [conversationKey]: events,
      },
    })),
}));
