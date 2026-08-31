import type { AgentRun, RunStore } from "@shawnden-coder/agent-runtime";
import type { WorkspaceRepository } from "workspace";
import type {
  ConversationQuery,
  ConversationSnapshot,
  RunPhase,
} from "../../shared/contracts/snapshot.js";

export interface ConversationQueryDependencies {
  readonly repository: WorkspaceRepository;
  readonly runStore: RunStore;
}

/** Read-only conversation projection scoped by both workspace and conversation ID. */
export async function getConversationSnapshot(
  dependencies: ConversationQueryDependencies,
  query: ConversationQuery,
): Promise<ConversationSnapshot> {
  const { repository, runStore } = dependencies;
  const runs = (await runStore.listRuns()).runs
    .filter(
      (run) =>
        run.context?.workspaceId === query.workspaceId &&
        run.context?.conversationId === query.conversationId,
    )
    .map(withPhase);
  const events = (
    await Promise.all(runs.map((run) => runStore.listEvents(run.runId)))
  ).flat();
  return {
    conversation: repository.getConversation(
      query.workspaceId,
      query.conversationId,
    ),
    messages: repository.listMessages(query.workspaceId, query.conversationId),
    runs,
    dispatches: repository
      .listDispatches(query.workspaceId)
      .filter((dispatch) => dispatch.conversationId === query.conversationId),
    events,
  };
}

function withPhase(run: AgentRun): AgentRun & { readonly phase: RunPhase } {
  let phase: RunPhase;
  switch (run.status) {
    case "queued":
      phase = "pending";
      break;
    case "running":
    case "retrying":
      phase = "active";
      break;
    case "waiting":
    case "blocked":
    case "interrupted":
      phase = "waiting";
      break;
    default:
      phase = "terminal";
  }
  return { ...run, phase };
}
