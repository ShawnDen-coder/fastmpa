import type { Logger } from "@shawnden-coder/agent-core";
import type {
  AgentRun,
  AgentRuntime,
  ScheduleRunner,
  SqliteDatabase,
  SqliteRunStore,
} from "@shawnden-coder/agent-runtime";
import type { SqliteWorkspaceRepository } from "workspace";
import type { ApplicationLogStore } from "../application-log.js";

export interface ApplicationStopDependencies {
  readonly worker: AgentRuntime;
  readonly scheduleRunner: ScheduleRunner;
  readonly runStore: SqliteRunStore;
  readonly repository: SqliteWorkspaceRepository;
  readonly database: SqliteDatabase;
  readonly logger: Logger;
  readonly logStore?: ApplicationLogStore;
  readonly project: (run: AgentRun) => void;
  readonly reconcile: (runs: readonly AgentRun[]) => void;
}

export function createApplicationStop(
  dependencies: ApplicationStopDependencies,
): (deadlineMs?: number) => Promise<void> {
  return async (deadlineMs = 15_000): Promise<void> => {
    const deadline = Date.now() + Math.max(1, deadlineMs);
    const stopController = new AbortController();
    const activeRunsForShutdown = new Set<string>();
    const deadlineTimer = setTimeout(
      () => {
        stopController.abort();
        dependencies.logger.warn(
          { activeRunIds: [...activeRunsForShutdown] },
          "shutdown deadline reached; waiting for cancellation before closing stores",
        );
      },
      Math.max(1, deadline - Date.now()),
    );
    try {
      await dependencies.scheduleRunner.stop(stopController.signal);
      const activeRuns = (await dependencies.runStore.listRuns()).runs.filter(
        isActiveRun,
      );
      for (const run of activeRuns) activeRunsForShutdown.add(run.runId);
      await Promise.all(
        activeRuns.map(async (run) => {
          try {
            const cancelled = await dependencies.worker.cancel(run.runId);
            if (cancelled) dependencies.project(cancelled);
          } catch (error: unknown) {
            dependencies.logger.warn(
              { err: error, runId: run.runId },
              "failed to cancel Run during shutdown",
            );
          }
        }),
      );
      await dependencies.worker.stopWorkers(stopController.signal);
      await dependencies.scheduleRunner.drain();
      const remainingRuns = (
        await dependencies.runStore.listRuns()
      ).runs.filter(isActiveRun);
      for (const run of remainingRuns) activeRunsForShutdown.add(run.runId);
      dependencies.reconcile((await dependencies.runStore.listRuns()).runs);
    } finally {
      clearTimeout(deadlineTimer);
      dependencies.runStore.close();
      dependencies.repository.close();
      dependencies.database.client.close();
      dependencies.logger.info("application stopped");
      if (dependencies.logStore) await dependencies.logStore.close();
    }
  };
}

function isActiveRun(run: AgentRun): boolean {
  return ["queued", "running", "retrying", "waiting", "blocked"].includes(
    run.status,
  );
}
