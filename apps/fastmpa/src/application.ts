import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  createLogger,
  type Logger,
  type ModelAdapter,
} from "@shawnden-coder/agent-core";
import {
  type AgentRun,
  AgentRuntime,
  AgentScheduler,
  DefaultRuntimeTooling,
  openSqliteDatabase,
  type RunDependencyResolver,
  type RunStatus,
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
  type Workspace,
  type WorkspaceRepository,
} from "workspace";
import { ConversationRunCoordinator } from "./conversation-run-coordinator.js";
import { CompletionProjector } from "./orchestrator.js";

export type ApplicationCommand =
  | { type: "workspace.create"; name: string; workspaceId?: string }
  | { type: "workspace.rename"; workspaceId: string; name: string }
  | {
      type: "conversation.create";
      workspaceId: string;
      title?: string;
      conversationId?: string;
      agentId?: string;
    }
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
  /** String entries remain accepted for lightweight legacy test doubles. */
  readonly workspaces: readonly (Workspace | string)[];
  readonly selectedWorkspaceId?: string;
  readonly selectedConversationId?: string;
  readonly conversations: readonly {
    id: string;
    workspaceId: string;
    title?: string;
  }[];
  readonly participants: readonly Participant[];
  readonly messages: readonly Message[];
  readonly runs: readonly (AgentRun & { readonly phase: RunPhase })[];
  readonly schedules: readonly import("workspace").Schedule[];
}
export type RunPhase = "pending" | "active" | "waiting" | "terminal";
export type CommandResult = {
  readonly run?: AgentRun;
  readonly created?: boolean;
};
export type ApplicationEventListener = (snapshot: ApplicationSnapshot) => void;
export interface FastMpaApplication {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSnapshot(query?: {
    workspaceId?: string;
    conversationId?: string;
  }): Promise<ApplicationSnapshot>;
  dispatch(command: ApplicationCommand): Promise<CommandResult>;
  subscribe(listener: ApplicationEventListener): () => void;
}
export interface FastMpaApplicationOptions {
  readonly databasePath: string;
  readonly model?: ModelAdapter;
  readonly tooling?: RuntimeTooling;
  readonly ownerId?: string;
  readonly logger?: Logger;
  readonly logPath?: string;
  readonly prettyLogs?: boolean;
}

export async function createApplication(
  options: FastMpaApplicationOptions,
): Promise<FastMpaApplication> {
  const logger =
    options.logger ??
    createLogger(undefined, {
      component: "application",
      logPath:
        options.logPath ??
        process.env.FASTMPA_LOG_PATH ??
        join(dirname(options.databasePath), "fastmpa.log"),
      pretty: options.prettyLogs ?? false,
    });
  // Application 持有唯一 root logger，下面的 Runtime/Scheduler 只消费 child logger。
  const database = await openSqliteDatabase({
    filePath: options.databasePath,
    migrationsFolder: false,
  });
  const repository: WorkspaceRepository =
    SqliteWorkspaceRepository.fromDatabase(database.client);
  const runStore = SqliteRunStore.fromDatabase(database);
  const projector = new CompletionProjector(repository);
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
    logger,
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
    dispatch: async (signal) => {
      const run = await scheduler.dispatchAndRun(signal);
      if (run) projector.project(run);
      await publish();
      return run;
    },
    onError: (error) => logger.warn({ err: error }, "schedule dispatch failed"),
    logger: logger.child({ component: "runtime-scheduler" }),
  });
  const listeners = new Set<ApplicationEventListener>();
  const conversationRuns = new ConversationRunCoordinator();
  let started = false;
  const app: FastMpaApplication = {
    async start() {
      if (started) return;
      started = true;
      logger.info("application started");
      worker.startWorkers();
      scheduleRunner.start();
      const persistedRuns = (await runStore.listRuns()).runs;
      projector.projectAll(persistedRuns);
      await publish();
    },
    async stop() {
      if (!started) return;
      started = false;
      // 必须先 drain 调度和 Worker，再关闭共享 SQLite 连接。
      await scheduleRunner.stop();
      await worker.stopWorkers();
      runStore.close();
      (repository as SqliteWorkspaceRepository).close();
      database.client.close();
      logger.info("application stopped");
    },
    async getSnapshot(query = {}) {
      const now = new Date().toISOString();
      if (!repository.getWorkspace("default"))
        repository.saveWorkspace({
          id: "default",
          name: "Default Workspace",
          createdAt: now,
          updatedAt: now,
        });
      const workspaces = repository.listWorkspaces();
      const selectedWorkspaceId = query.workspaceId ?? workspaces[0]?.id;
      const selectedConversationId = query.conversationId;
      const conversations = selectedWorkspaceId
        ? repository
            .listConversations(selectedWorkspaceId)
            .filter(
              (conversation) =>
                !selectedConversationId ||
                conversation.id === selectedConversationId,
            )
        : [];
      const messages = conversations.flatMap((conversation) =>
        repository.listMessages(conversation.workspaceId, conversation.id),
      );
      return {
        workspaces,
        selectedWorkspaceId,
        selectedConversationId,
        conversations,
        participants: selectedWorkspaceId
          ? repository.listParticipants(selectedWorkspaceId)
          : [],
        messages,
        runs: (await runStore.listRuns()).runs
          .filter(
            (run) =>
              !selectedWorkspaceId ||
              run.context?.workspaceId === selectedWorkspaceId,
          )
          .map(withPhase),
        schedules: repository.listSchedules(selectedWorkspaceId),
      };
    },
    async dispatch(command) {
      if (command.type === "workspace.create") {
        const id = command.workspaceId ?? randomUUID();
        if (repository.getWorkspace(id))
          throw new Error(`Workspace already exists: ${id}`);
        const now = new Date().toISOString();
        repository.saveWorkspace({
          id,
          name: command.name,
          createdAt: now,
          updatedAt: now,
        });
        await publish();
        return { created: true };
      }
      if (command.type === "workspace.rename") {
        const workspace = repository.getWorkspace(command.workspaceId);
        if (!workspace)
          throw new Error(`Workspace not found: ${command.workspaceId}`);
        repository.saveWorkspace({
          ...workspace,
          name: command.name,
          updatedAt: new Date().toISOString(),
        });
        await publish();
        return {};
      }
      if (command.type === "conversation.create") {
        if (!repository.getWorkspace(command.workspaceId))
          throw new Error(`Workspace not found: ${command.workspaceId}`);
        const agentId = command.agentId ?? "demo-agent";
        const id = command.conversationId ?? randomUUID();
        ensureWorkspace(command.workspaceId, id, agentId);
        repository.saveConversation({
          id,
          workspaceId: command.workspaceId,
          title: command.title,
          participantIds: ["human", agentId],
          createdAt: new Date().toISOString(),
        });
        await publish();
        return { created: true };
      }
      if (command.type === "cancel")
        return publishResult({ run: await worker.cancel(command.runId) });
      if (command.type === "retry") {
        const run = await runStore.get(command.runId);
        if (!run?.input) throw new Error("Run cannot be retried");
        return publishResult({ run: await worker.retry(command.runId) });
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
          return publishResult({ run: await worker.cancel(command.runId) });
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
        return publishResult({
          run: await worker.resume(command.runId, {
            ...run.input.turn,
            messages,
          }),
        });
      }
      if (command.type === "schedule.create") {
        const id = command.scheduleId ?? randomUUID();
        scheduleRunner.upsert({
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
      return conversationRuns.enqueue(
        `${command.workspaceId}:${command.conversationId}`,
        () => submit(command),
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return app;
  async function submit(
    command: Extract<ApplicationCommand, { type: "submit" }>,
  ): Promise<CommandResult> {
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
    const conversationMessages = repository
      .listMessages(command.workspaceId, command.conversationId)
      .map((item) => ({
        role:
          item.senderId === agentId
            ? ("assistant" as const)
            : ("user" as const),
        content: item.body,
      }));
    const enqueued = await worker.enqueue({
      runId,
      turn: { messages: conversationMessages },
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
  }
  async function publish(): Promise<void> {
    const snapshot = await app.getSnapshot();
    for (const listener of listeners) listener(snapshot);
  }
  async function publishResult(result: CommandResult): Promise<CommandResult> {
    if (result.run) projector.project(result.run);
    await publish();
    return result;
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
    else {
      const conversation = repository.getConversation(
        workspaceId,
        conversationId,
      );
      if (conversation && !conversation.participantIds.includes(agentId))
        repository.saveConversation({
          ...conversation,
          participantIds: [...conversation.participantIds, agentId],
        });
    }
  }
}

function withPhase(run: AgentRun): AgentRun & { readonly phase: RunPhase } {
  let phase: RunPhase;
  switch (run.status as RunStatus) {
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
