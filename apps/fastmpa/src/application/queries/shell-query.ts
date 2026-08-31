import type {
  ModelAdapter,
  StreamingModelAdapter,
} from "@shawnden-coder/agent-core";
import type { RunStore } from "@shawnden-coder/agent-runtime";
import { loadAttention, type WorkspaceRepository } from "workspace";
import type {
  ShellSnapshot,
  ShellSnapshotQuery,
} from "../../shared/contracts/snapshot.js";

export interface ShellQueryDependencies {
  readonly repository: WorkspaceRepository;
  readonly runStore: RunStore;
  readonly models: ReadonlyMap<string, ModelAdapter | StreamingModelAdapter>;
  readonly configuredModelKeys: ReadonlySet<string>;
  readonly defaultModelLabel: string;
}

/** Read-only, workspace-scoped shell projection used by the Desktop facade. */
export async function getShellSnapshot(
  dependencies: ShellQueryDependencies,
  query?: ShellSnapshotQuery,
): Promise<ShellSnapshot> {
  const { repository } = dependencies;
  const workspaces = [...repository.listWorkspaces()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const workspaceId =
    (query?.workspaceId &&
    workspaces.some((item) => item.id === query.workspaceId)
      ? query.workspaceId
      : undefined) ??
    workspaces[0]?.id ??
    "";
  const attention = workspaceId
    ? loadAttention(repository, workspaceId, "human")
    : undefined;
  const persistedRuns = (await dependencies.runStore.listRuns()).runs;
  return {
    workspaces,
    attention,
    workspaceId,
    conversations: workspaceId
      ? repository.listConversations(workspaceId).map((conversation) => {
          const messages = repository.listMessages(
            conversation.workspaceId,
            conversation.id,
          );
          const lastMessage = messages.at(-1);
          const activeRun = persistedRuns
            .filter(
              (run) =>
                run.context?.workspaceId === conversation.workspaceId &&
                run.context?.conversationId === conversation.id,
            )
            .find((run) =>
              ["queued", "running", "retrying", "waiting"].includes(run.status),
            );
          const unread = attention?.inbox.some(
            (message) => message.conversationId === conversation.id,
          );
          return {
            id: conversation.id,
            workspaceId: conversation.workspaceId,
            kind: conversation.kind,
            title: conversation.title,
            participantIds: conversation.participantIds,
            lastMessagePreview: lastMessage?.body,
            lastMessageAt: lastMessage?.createdAt,
            activeRunStatus: activeRun?.status,
            unread,
          };
        })
      : [],
    participants: workspaceId ? repository.listParticipants(workspaceId) : [],
    schedules: repository.listSchedules(workspaceId),
    dispatches: repository.listDispatches(workspaceId),
    models: [...dependencies.models.keys()].map((key) => ({
      key,
      label: key === "default" ? dependencies.defaultModelLabel : key,
      configured: dependencies.configuredModelKeys.has(key),
      provider: key === "default" ? "OpenRouter" : undefined,
    })),
  };
}
