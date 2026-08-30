import { randomUUID } from "node:crypto";
import type { ModelAdapter } from "@shawnden-coder/agent-core";
import {
  type AgentRun,
  AgentRuntime,
  AgentScheduler,
  DefaultRuntimeTooling,
  openSqliteDatabase,
  type RunDependencyResolver,
  type RuntimeTooling,
  ScheduleRunner,
  SqliteApprovalStore,
  type SqliteDatabase,
  SqliteRunStore,
  ToolCatalog,
  ToolPipeline,
} from "@shawnden-coder/agent-runtime";
import {
  type Message,
  type Participant,
  SqliteWorkspaceRepository,
  sendMessage,
  type WorkspaceRepository,
} from "workspace";
import { CompletionProjector } from "./orchestrator.js";

export type ApplicationCommand =
  | {
      type: "submit";
      workspaceId: string;
      conversationId: string;
      body: string;
      agentId?: string;
    }
  | { type: "cancel"; runId: string }
  | { type: "retry"; runId: string }
  | { type: "approve"; runId: string; approvalId: string }
  | { type: "reject"; runId: string; approvalId: string }
  | {
      type: "schedule.create";
      workspaceId: string;
      agentId: string;
      instruction: string;
      intervalMs: number;
      scheduleId?: string;
    }
  | {
      type: "schedule.pause" | "schedule.resume" | "schedule.delete";
      workspaceId: string;
      scheduleId: string;
    };
export interface ApplicationSnapshot {
  readonly workspaces: readonly string[];
  readonly conversations: readonly {
    id: string;
    workspaceId: string;
    title?: string;
  }[];
  readonly participants: readonly Participant[];
  readonly messages: readonly Message[];
  readonly runs: readonly AgentRun[];
  readonly schedules: readonly import("workspace").Schedule[];
}
export type CommandResult = {
  readonly run?: AgentRun;
  readonly created?: boolean;
};
export type ApplicationEventListener = (snapshot: ApplicationSnapshot) => void;
export interface FastMpaApplication {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSnapshot(): Promise<ApplicationSnapshot>;
  dispatch(command: ApplicationCommand): Promise<CommandResult>;
  subscribe(listener: ApplicationEventListener): () => void;
}
export interface FastMpaApplicationOptions {
  readonly databasePath: string;
  readonly model?: ModelAdapter;
  readonly tooling?: RuntimeTooling;
  readonly ownerId?: string;
}

export async function createApplication(
  options: FastMpaApplicationOptions,
): Promise<FastMpaApplication> {
  const database = await openSqliteDatabase({
    filePath: options.databasePath,
    migrationsFolder: false,
  });
  const repository: WorkspaceRepository =
    SqliteWorkspaceRepository.fromDatabase(database.client);
  const runStore = SqliteRunStore.fromDatabase(database);
  const projector = new CompletionProjector(database.client, repository);
  const model = options.model ?? {
    complete: async () => ({
      type: "text" as const,
      content: "演示 Agent 已完成任务。",
    }),
  };
  const tooling = options.tooling ?? createDefaultTooling(database.client);
  const resolver: RunDependencyResolver = {
    resolveModel: () => model,
    resolveTools: (_toolsetKey, context) => {
      if (!context) throw new Error("Run execution context is required");
      return tooling.resolveTools(context);
    },
  };
  const worker = new AgentRuntime(runStore, {
    ownerId: options.ownerId ?? `fastmpa-${process.pid}`,
    leaseMs: 30_000,
    resolver,
    onWorkerRun: (run) => {
      projector.project(run);
      void publish();
    },
  });
  const scheduler = new AgentScheduler({
    repository,
    runtime: worker,
    modelKey: "demo",
    toolsetKey: "local",
  });
  const scheduleRunner = new ScheduleRunner({
    scheduler,
    repository,
    dispatch: (signal) => scheduler.dispatchAndRun(signal),
    onError: (error) => void error,
  });
  const listeners = new Set<ApplicationEventListener>();
  let started = false;
  const app: FastMpaApplication = {
    async start() {
      started = true;
      worker.startWorkers();
      scheduleRunner.start();
      const persistedRuns = (await runStore.listRuns()).runs;
      projector.projectAll(persistedRuns);
      await publish();
    },
    async stop() {
      if (!started) return;
      started = false;
      scheduleRunner.stop();
      await worker.stopWorkers();
      runStore.close();
      (repository as SqliteWorkspaceRepository).close();
      database.client.close();
    },
    async getSnapshot() {
      const workspaces = repository.listWorkspaceIds?.() ?? ["default"];
      const conversations = workspaces.flatMap((workspaceId) =>
        repository.listConversations(workspaceId),
      );
      const messages = conversations.flatMap((conversation) =>
        repository.listMessages(conversation.workspaceId, conversation.id),
      );
      return {
        workspaces,
        conversations,
        participants: workspaces.flatMap((workspaceId) =>
          repository.listParticipants(workspaceId),
        ),
        messages,
        runs: (await runStore.listRuns()).runs,
        schedules: repository.listSchedules(),
      };
    },
    async dispatch(command) {
      if (command.type === "cancel")
        return { run: await worker.cancel(command.runId) };
      if (command.type === "retry") {
        const run = await runStore.get(command.runId);
        if (!run?.input) throw new Error("Run cannot be retried");
        return { run: await worker.resume(command.runId, run.input.turn) };
      }
      if (command.type === "approve" || command.type === "reject") {
        const run = await runStore.get(command.runId);
        if (!run?.error?.details)
          throw new Error(
            `Approval ${command.approvalId} is not configured for Run ${command.runId}`,
          );
        const details = run.error.details as { approvalId?: unknown };
        if (details.approvalId !== command.approvalId)
          throw new Error("Approval does not belong to Run");
        if (command.type === "reject") {
          tooling.reject(command.approvalId, command.runId);
          return { run: await worker.cancel(command.runId) };
        }
        const result = await tooling.approve(command.approvalId, command.runId);
        if (result.status !== "completed")
          throw new Error("Approval did not complete tool execution");
        if (!run.input) throw new Error("Waiting Run has no persisted input");
        const messages = [
          ...(run.result?.messages ?? run.input.turn.messages),
          {
            role: "tool" as const,
            content: result.result.content,
            toolCallId: result.result.toolCallId,
          },
        ];
        return {
          run: await worker.resume(command.runId, {
            ...run.input.turn,
            messages,
          }),
        };
      }
      if (command.type === "schedule.create") {
        const id = command.scheduleId ?? randomUUID();
        repository.saveSchedule({
          id,
          workspaceId: command.workspaceId,
          agentId: command.agentId,
          instruction: command.instruction,
          intervalMs: command.intervalMs,
          nextRunAt: Date.now() + command.intervalMs,
          createdAt: new Date().toISOString(),
          enabled: true,
        });
        await publish();
        return {};
      }
      if (
        command.type === "schedule.pause" ||
        command.type === "schedule.resume" ||
        command.type === "schedule.delete"
      ) {
        const schedule = repository.getSchedule(
          command.workspaceId,
          command.scheduleId,
        );
        if (!schedule)
          throw new Error(`Schedule not found: ${command.scheduleId}`);
        if (command.type === "schedule.delete")
          repository.deleteSchedule(schedule.workspaceId, schedule.id);
        else
          repository.saveSchedule({
            ...schedule,
            enabled: command.type === "schedule.resume",
          });
        await publish();
        return {};
      }
      if (command.type !== "submit") return {};
      const agentId = command.agentId ?? "demo-agent";
      ensureWorkspace(command.workspaceId, command.conversationId, agentId);
      const message = sendMessage(repository, {
        id: randomUUID(),
        workspaceId: command.workspaceId,
        conversationId: command.conversationId,
        senderId: "human",
        body: command.body,
        mentions: [agentId],
        createdAt: new Date().toISOString(),
      }).message;
      const runId = `run:${message.id}`;
      const enqueued = await worker.enqueue({
        runId,
        turn: { messages: [{ role: "user", content: command.body }] },
        dependencies: { modelKey: "demo", toolsetKey: "local" },
        context: {
          workspaceId: command.workspaceId,
          agentId,
          conversationId: command.conversationId,
          trigger: "mention",
          sourceRef: { type: "message", id: message.id },
        },
      });
      if (!enqueued.created) return enqueued;
      const run = await worker.run(runId);
      if (run) projector.project(run);
      await publish();
      return { run, created: true };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return app;
  async function publish(): Promise<void> {
    const snapshot = await app.getSnapshot();
    for (const listener of listeners) listener(snapshot);
  }
  function ensureWorkspace(
    workspaceId: string,
    conversationId: string,
    agentId: string,
  ): void {
    if (!repository.getParticipant(workspaceId, agentId))
      repository.saveParticipant({
        id: agentId,
        workspaceId,
        kind: "agent",
        name: "Demo Agent",
        status: "active",
      });
    if (!repository.getParticipant(workspaceId, "human"))
      repository.saveParticipant({
        id: "human",
        workspaceId,
        kind: "human",
        name: "You",
        status: "active",
      });
    if (!repository.getConversation(workspaceId, conversationId))
      repository.saveConversation({
        id: conversationId,
        workspaceId,
        participantIds: ["human", agentId],
        createdAt: new Date().toISOString(),
      });
  }
}

function createDefaultTooling(
  client: SqliteDatabase["client"],
): RuntimeTooling {
  const catalog = new ToolCatalog();
  return new DefaultRuntimeTooling(
    catalog,
    new ToolPipeline(
      catalog,
      undefined,
      undefined,
      SqliteApprovalStore.fromDatabase(client),
    ),
  );
}
