import { useMemo, useState } from "react";
import type { ShellSnapshot } from "../../shared/contracts/snapshot.js";
import { useSelectionStore } from "../stores/index.js";

export function useWorkspaceController(snapshot: ShellSnapshot | undefined): {
  readonly workspace: ShellSnapshot["workspaces"][number] | undefined;
  readonly conversations: ShellSnapshot["conversations"];
  readonly agents: ShellSnapshot["participants"];
  readonly selectedConversation:
    | ShellSnapshot["conversations"][number]
    | undefined;
  readonly conversationId: string | undefined;
  readonly selectedWorkspaceId: string | undefined;
  readonly search: string;
  readonly agentFilter: string;
  readonly setSearch: (value: string) => void;
  readonly setAgentFilter: (value: string) => void;
  readonly selectWorkspace: (workspaceId: string) => void;
  readonly selectConversation: (conversationId?: string) => void;
} {
  const selectedWorkspaceId = useSelectionStore((state) => state.workspaceId);
  const setSelectedWorkspaceId = useSelectionStore(
    (state) => state.setWorkspaceId,
  );
  const selectedConversationId = useSelectionStore(
    (state) => state.conversationId,
  );
  const setSelectedConversationId = useSelectionStore(
    (state) => state.setConversationId,
  );
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const workspace =
    snapshot?.workspaces.find((item) => item.id === selectedWorkspaceId) ??
    snapshot?.workspaces[0];
  const conversations = useMemo(
    () =>
      snapshot?.conversations.filter(
        (conversation) =>
          conversation.workspaceId === workspace?.id &&
          (agentFilter === "all" ||
            conversation.participantIds.includes(agentFilter)) &&
          (conversation.title ?? "Untitled conversation")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) ?? [],
    [agentFilter, search, snapshot?.conversations, workspace?.id],
  );
  const agents = useMemo(
    () =>
      snapshot?.participants.filter(
        (participant) =>
          participant.workspaceId === workspace?.id &&
          participant.kind === "agent",
      ) ?? [],
    [snapshot?.participants, workspace?.id],
  );
  const conversationId = selectedConversationId ?? conversations[0]?.id;
  const selectedConversation = snapshot?.conversations.find(
    (conversation) =>
      conversation.workspaceId === workspace?.id &&
      conversation.id === conversationId,
  );
  return {
    workspace,
    conversations,
    agents,
    selectedConversation,
    conversationId,
    selectedWorkspaceId,
    search,
    agentFilter,
    setSearch,
    setAgentFilter,
    selectWorkspace: (workspaceId) => {
      setSelectedWorkspaceId(workspaceId);
      setSelectedConversationId(undefined);
      setAgentFilter("all");
      setSearch("");
    },
    selectConversation: setSelectedConversationId,
  };
}
