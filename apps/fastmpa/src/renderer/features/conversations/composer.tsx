import { useCallback, useEffect, useState } from "react";
import type { ShellSnapshot } from "../../../shared/contracts/snapshot.js";
import { useConversationStore, useSelectionStore } from "../../stores/index.js";
import { shouldSubmitOnEnter } from "./composer-policy.js";

const EMPTY_QUEUE: readonly string[] = [];

export function Composer({
  workspaceId,
  conversationId,
  agents,
  closing,
}: {
  readonly workspaceId?: string;
  readonly conversationId?: string;
  readonly agents: ShellSnapshot["participants"];
  readonly closing: boolean;
}): React.JSX.Element {
  const selectedAgentId = useSelectionStore((state) => state.agentId);
  const setSelectedAgentId = useSelectionStore((state) => state.setAgentId);
  const setDraftValue = useConversationStore((state) => state.setDraft);
  const setFailedMessage = useConversationStore(
    (state) => state.setFailedMessage,
  );
  const clearFailedMessage = useConversationStore(
    (state) => state.clearFailedMessage,
  );
  const enqueue = useConversationStore((state) => state.enqueue);
  const dequeue = useConversationStore((state) => state.dequeue);
  const conversationKey =
    workspaceId && conversationId
      ? `${workspaceId}:${conversationId}`
      : undefined;
  const draft = useConversationStore((state) =>
    conversationKey ? (state.drafts[conversationKey] ?? "") : "",
  );
  const sendQueue = useConversationStore((state) =>
    conversationKey
      ? (state.sendQueues[conversationKey] ?? EMPTY_QUEUE)
      : EMPTY_QUEUE,
  );
  const failedMessage = useConversationStore((state) =>
    conversationKey ? state.failedMessages[conversationKey] : undefined,
  );
  const activeAgentId =
    agents.find((agent) => agent.id === selectedAgentId)?.id ?? agents[0]?.id;
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  function setDraft(value: string): void {
    if (conversationKey) setDraftValue(conversationKey, value);
  }

  const dispatchMessage = useCallback(
    async (body: string): Promise<void> => {
      if (!workspaceId || !conversationId || !activeAgentId) return;
      setSending(true);
      setSendError(undefined);
      try {
        await window.fastMpa.application.dispatch({
          type: "submit",
          workspaceId,
          conversationId,
          body,
          agentId: activeAgentId,
        });
        if (conversationKey) clearFailedMessage(conversationKey);
      } catch (error: unknown) {
        if (conversationKey) {
          setDraftValue(conversationKey, body);
          setFailedMessage(conversationKey, body);
        }
        setSendError(
          error instanceof Error ? error.message : "Message failed to send",
        );
      } finally {
        setSending(false);
      }
    },
    [
      activeAgentId,
      clearFailedMessage,
      conversationId,
      conversationKey,
      setDraftValue,
      setFailedMessage,
      workspaceId,
    ],
  );

  async function submit(): Promise<void> {
    if (!draft.trim() || !conversationKey) return;
    const body = draft.trim();
    setDraft("");
    if (sending) {
      enqueue(conversationKey, body);
      return;
    }
    await dispatchMessage(body);
  }

  useEffect(() => {
    if (sending || sendQueue.length === 0 || !conversationKey) return;
    const next = sendQueue[0];
    dequeue(conversationKey);
    void dispatchMessage(next);
  }, [conversationKey, dequeue, dispatchMessage, sendQueue, sending]);

  return (
    <div className="composer">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (
            shouldSubmitOnEnter({
              key: event.key,
              shiftKey: event.shiftKey,
              isComposing: event.nativeEvent.isComposing,
            })
          ) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="Message FastMPA…"
        rows={3}
      />
      <div className="composer-options">
        <label>
          Agent
          <select
            value={activeAgentId ?? ""}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            disabled={!activeAgentId || sending}
          >
            {agents.length === 0 && <option value="">No active agent</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        {sendQueue.length > 0 && <span>{sendQueue.length} queued</span>}
        {!conversationId && <span>Select a conversation to start</span>}
        {conversationId && agents.length === 0 && (
          <span>No active agent is configured</span>
        )}
      </div>
      {sendError && (
        <div className="composer-error" role="alert">
          {sendError}
          {failedMessage && conversationKey && (
            <div className="composer-error-actions">
              <button
                type="button"
                onClick={() => {
                  clearFailedMessage(conversationKey);
                  void dispatchMessage(failedMessage);
                }}
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftValue(conversationKey, failedMessage);
                  clearFailedMessage(conversationKey);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => clearFailedMessage(conversationKey)}
              >
                Discard
              </button>
            </div>
          )}
        </div>
      )}
      <div className="composer-footer">
        <span>Enter to send · Shift+Enter for new line</span>
        <button
          type="button"
          className="send-button"
          disabled={
            !draft.trim() || closing || !conversationId || !activeAgentId
          }
          onClick={() => void submit()}
        >
          {sending ? "Queue" : "Send"}
        </button>
      </div>
    </div>
  );
}
