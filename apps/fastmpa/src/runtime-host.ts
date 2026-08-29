import type { RunDependencyResolver } from "@shawnden-coder/agent-runtime";
import {
  LeaseRuntimeWorker,
  RuntimeWorkerLoop,
  SqliteRunStore,
} from "@shawnden-coder/agent-runtime";
import {
  AgentScheduler,
  ScheduleRunner,
  SqliteWorkClaimStore,
} from "agent-scheduler";
import { SqliteApprovalStore } from "tool-pipeline";
import { SqliteWorkspaceRepository, type WorkspaceRepository } from "workspace";

export interface FastMpaHostOptions {
  readonly repository?: WorkspaceRepository;
  readonly databasePath: string;
  readonly ownerId: string;
  readonly leaseMs: number;
  readonly modelKey: string;
  readonly toolsetKey: string;
  readonly resolver: RunDependencyResolver;
  readonly approvalStore?: SqliteApprovalStore;
  readonly pollIntervalMs?: number;
}

export interface FastMpaHost {
  readonly scheduler: AgentScheduler;
  readonly schedules: ScheduleRunner;
  readonly runStore: SqliteRunStore;
  readonly worker: LeaseRuntimeWorker;
  readonly workerLoop: RuntimeWorkerLoop;
  readonly approvalStore: SqliteApprovalStore;
  readonly workspaceRepository: WorkspaceRepository;
  start(): void;
  stop(): void;
  close(): void;
}

/** 组装可运行的 FastMPA 进程；业务 Agent 和平台规则仍由调用方注入。 */
export async function createFastMpaHost(
  options: FastMpaHostOptions,
): Promise<FastMpaHost> {
  const sqliteConfig = {
    filePath: options.databasePath,
    migrationsFolder: false as const,
  };
  const runStore = await SqliteRunStore.open(sqliteConfig);
  const claimStore = await SqliteWorkClaimStore.open(sqliteConfig);
  const workspaceRepository =
    options.repository ?? new SqliteWorkspaceRepository(options.databasePath);
  const ownsWorkspaceRepository = options.repository === undefined;
  const approvalStore =
    options.approvalStore ?? new SqliteApprovalStore(options.databasePath);
  const ownsApprovalStore = options.approvalStore === undefined;
  const worker = new LeaseRuntimeWorker(runStore, {
    ownerId: options.ownerId,
    leaseMs: options.leaseMs,
    resolver: options.resolver,
  });
  const scheduler = new AgentScheduler({
    repository: workspaceRepository,
    runtime: worker,
    modelKey: options.modelKey,
    toolsetKey: options.toolsetKey,
    claimStore,
  });
  const schedules = new ScheduleRunner({
    repository: workspaceRepository,
    scheduler,
    pollIntervalMs: options.pollIntervalMs,
    dispatch: (signal) => scheduler.dispatch(signal),
  });
  const workerLoop = new RuntimeWorkerLoop({
    store: runStore,
    worker,
    pollIntervalMs: options.pollIntervalMs,
  });
  return {
    scheduler,
    schedules,
    runStore,
    worker,
    workerLoop,
    approvalStore,
    workspaceRepository,
    start: () => {
      schedules.start();
      workerLoop.start();
    },
    stop: () => {
      schedules.stop();
      workerLoop.stop();
    },
    close: () => {
      schedules.stop();
      workerLoop.stop();
      claimStore.close();
      if (ownsApprovalStore) approvalStore.close();
      if (ownsWorkspaceRepository)
        (workspaceRepository as SqliteWorkspaceRepository).close();
      runStore.close();
    },
  };
}
