import type { AgentRun, RunStore } from "@shawnden-coder/agent-runtime";
import type { WorkspaceRepository } from "workspace";
import type { RunPhase, RunSnapshot } from "../../shared/contracts/snapshot.js";

export interface RunQueryDependencies {
  readonly repository: WorkspaceRepository;
  readonly runStore: RunStore;
}

export async function getRunSnapshot(
  dependencies: RunQueryDependencies,
  runId: string,
): Promise<RunSnapshot> {
  const run = await dependencies.runStore.get(runId);
  const dispatch =
    run?.context?.sourceRef?.type === "message"
      ? dependencies.repository
          .listDispatches()
          .find((item) => item.messageId === run.context?.sourceRef?.id)
      : undefined;
  return {
    run: run ? withPhase(run) : undefined,
    dispatch,
    events: run ? await dependencies.runStore.listEvents(runId) : [],
  };
}

export function withRunPhase(
  run: AgentRun,
): AgentRun & { readonly phase: RunPhase } {
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

function withPhase(run: AgentRun): AgentRun & { readonly phase: RunPhase } {
  return withRunPhase(run);
}
