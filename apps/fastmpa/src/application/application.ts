import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  createLogger,
  type Logger,
  type ModelAdapter,
  type StreamingModelAdapter,
} from "@shawnden-coder/agent-core";
import {
  type AgentRun,
  AgentRuntime,
  AgentScheduler,
  DefaultRuntimeTooling,
  openSqliteDatabase,
  type RunDependencyResolver,
  type RuntimeLiveEvent,
  type RuntimeTooling,
  ScheduleRunner,
  SqliteApprovalStore,
  type SqliteDatabase,
  SqliteRunStore,
  ToolCatalog,
  ToolPipeline,
} from "@shawnden-coder/agent-runtime";
import {
  type AgentInput,
  type AgentPatch,
  type Conversation,
  type ConversationDispatch,
  type DispatchAssignmentStatus,
  type Message,
  type Participant,
  SqliteWorkspaceRepository,
  sendMessage,
  type WorkspaceRepository,
} from "workspace";
import type { SnapshotInvalidation } from "../shared/contracts/invalidation.js";
import type {
  SettingsSnapshot,
  SettingsUpdate,
} from "../shared/contracts/settings.js";
import type {
  ConversationQuery,
  ConversationSnapshot,
  RunSnapshot,
  ShellSnapshot,
  ShellSnapshotQuery,
} from "../shared/contracts/snapshot.js";
import {
  type ApplicationLogEntry,
  ApplicationLogStore,
} from "./application-log.js";
import { handleAgentCommand } from "./commands/agent-commands.js";
import { handleConversationCommand } from "./commands/conversation-commands.js";
import { handleRunCommand } from "./commands/run-commands.js";
import { handleScheduleCommand } from "./commands/schedule-commands.js";
import { handleWorkspaceCommand } from "./commands/workspace-commands.js";
import { ConversationRunCoordinator } from "./conversation-run-coordinator.js";
import { AgentRouter } from "./dispatch/agent-router.js";
import {
  buildAgentContextMessages,
  findMentionedAgentIds,
  selectConversationContext,
} from "./dispatch/context-builder.js";
import { createApplicationStop } from "./lifecycle/application-stop.js";
import { CompletionProjector } from "./orchestrator.js";
import { getConversationSnapshot as queryConversationSnapshot } from "./queries/conversation-query.js";
import { getDispatchSnapshot as queryDispatchSnapshot } from "./queries/dispatch-query.js";
import { getRunSnapshot as queryRunSnapshot } from "./queries/run-query.js";
import { getShellSnapshot as queryShellSnapshot } from "./queries/shell-query.js";
import { SqliteSettingsStore } from "./settings-store.js";

export { selectConversationContext } from "./dispatch/context-builder.js";

export type ApplicationCommand =
  | { type: "workspace.create"; name: string; workspaceId?: string }
  | { type: "workspace.rename"; workspaceId: string; name: string }
  | { type: "agent.create"; workspaceId: string; input: AgentInput }
  | {
      type: "agent.update";
      workspaceId: string;
      agentId: string;
      patch: AgentPatch;
    }
  | { type: "agent.activate"; workspaceId: string; agentId: string }
  | { type: "agent.archive"; workspaceId: string; agentId: string }
  | {
      type: "conversation.direct.open";
      workspaceId: string;
      agentId: string;
      conversationId?: string;
    }
  | {
      type: "conversation.group.create";
      workspaceId: string;
      title: string;
      agentIds: readonly string[];
      routing?: Partial<import("workspace").GroupRoutingPolicy>;
    }
  | {
      type: "conversation.group.rename";
      workspaceId: string;
      conversationId: string;
      title: string;
    }
  | {
      type: "conversation.member.add";
      workspaceId: string;
      conversationId: string;
      agentIds: readonly string[];
    }
  | {
      type: "conversation.member.remove";
      workspaceId: string;
      conversationId: string;
      agentId: string;
    }
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
export type { ApplicationLogEntry };
export type CommandResult = {
  readonly run?: AgentRun;
  readonly runs?: readonly AgentRun[];
  readonly created?: boolean;
  readonly conversationId?: string;
  readonly participant?: Participant;
};
export type ApplicationEvent = RuntimeLiveEvent;
export interface FastMpaApplication {
  start(): Promise<void>;
  stop(deadlineMs?: number): Promise<void>;
  getShellSnapshot(query?: ShellSnapshotQuery): Promise<ShellSnapshot>;
  getSettingsSnapshot(workspaceId: string): SettingsSnapshot;
  updateSettings(update: SettingsUpdate): SettingsSnapshot;
  getConversationSnapshot(
    query: ConversationQuery,
  ): Promise<ConversationSnapshot>;
  getDispatchSnapshot(dispatchId: string): Promise<ConversationDispatch>;
  getRunSnapshot(runId: string): Promise<RunSnapshot>;
  dispatch(command: ApplicationCommand): Promise<CommandResult>;
  subscribeEvents(listener: (event: ApplicationEvent) => void): () => void;
  subscribeSnapshotInvalidated(
    listener: (scope: SnapshotInvalidation) => void,
  ): () => void;
  getRecentLogs(limit?: number): readonly ApplicationLogEntry[];
  subscribeLogs(listener: (entry: ApplicationLogEntry) => void): () => void;
  getLogPath(): string;
}
export interface FastMpaApplicationOptions {
  readonly databasePath: string;
  readonly model?: ModelAdapter | StreamingModelAdapter;
  readonly models?: Readonly<
    Record<string, ModelAdapter | StreamingModelAdapter>
  >;
  /** Override model availability for deterministic hosts and tests. */
  readonly modelConfigured?: boolean;
  readonly tooling?: RuntimeTooling;
  readonly ownerId?: string;
  readonly logger?: Logger;
  readonly logPath?: string;
  readonly prettyLogs?: boolean;
}

export async function createApplication(
  options: FastMpaApplicationOptions,
): Promise<FastMpaApplication> {
  const logPath =
    options.logPath ??
    process.env.FASTMPA_LOG_PATH ??
    join(dirname(options.databasePath), "fastmpa.log");
  const logStore = options.logger
    ? undefined
    : new ApplicationLogStore(logPath);
  const logger =
    options.logger ??
    createLogger(undefined, {
      component: "application",
      destination: logStore,
      pretty: options.prettyLogs ?? false,
    });
  // Application 持有唯一 root logger，下面的 Runtime/Scheduler 只消费 child logger。
  const database = await openSqliteDatabase({
    filePath: options.databasePath,
    migrationsFolder: false,
  });
  const repository: WorkspaceRepository =
    SqliteWorkspaceRepository.fromDatabase(database.client);
  const settingsStore = new SqliteSettingsStore(database.client);
  const runStore = SqliteRunStore.fromDatabase(database);
  const projector = new CompletionProjector(repository);
  const model = options.model ?? {
    complete: async () => ({
      type: "text" as const,
      content: "The configured model completed the task.",
    }),
  };
  const defaultModelConfigured =
    options.modelConfigured ??
    (options.model !== undefined ||
      process.env.FASTMPA_E2E === "1" ||
      Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL));
  const tooling = options.tooling ?? createDefaultTooling(database.client);
  const models = new Map<string, ModelAdapter | StreamingModelAdapter>([
    ["default", model],
    ...Object.entries(options.models ?? {}),
  ]);
  const configuredModelKeys = new Set([
    ...(defaultModelConfigured ? ["default"] : []),
    ...Object.keys(options.models ?? {}),
  ]);
  const resolver: RunDependencyResolver = {
    resolveModel: (modelKey) => {
      const resolved = models.get(modelKey);
      if (!resolved) throw new Error(`Unknown model: ${modelKey}`);
      return resolved;
    },
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
      logger.info(
        {
          workspaceId: run.context?.workspaceId,
          conversationId: run.context?.conversationId,
          runId: run.runId,
          command: "runtime.run",
        },
        "runtime Run state updated",
      );
      void publishRuntimeUpdate(run);
    },
    onLiveEvent: (event) => {
      for (const listener of eventListeners) listener(event);
    },
  });
  const scheduler = new AgentScheduler({
    repository,
    runtime: worker,
    modelKey: "default",
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
  const eventListeners = new Set<(event: ApplicationEvent) => void>();
  const invalidationListeners = new Set<
    (scope: SnapshotInvalidation) => void
  >();
  const conversationRuns = new ConversationRunCoordinator();
  let started = false;
  let stopping = false;
  let closing: Promise<void> | undefined;
  const app: FastMpaApplication = {
    async start() {
      if (started) return;
      if (stopping) throw new Error("Application has been stopped");
      started = true;
      ensureDefaultWorkspace();
      migrateLegacyModelKeys();
      logger.info("application started");
      worker.startWorkers();
      scheduleRunner.start();
      const persistedRuns = (await runStore.listRuns()).runs;
      projector.projectAll(persistedRuns);
      reconcileDispatches(persistedRuns);
      await resumePendingDispatches();
      reconcileDispatches((await runStore.listRuns()).runs);
      await publish({ scope: "shell" });
    },
    stop(deadlineMs = 15_000) {
      if (closing) return closing;
      if (!started) return Promise.resolve();
      stopping = true;
      started = false;
      closing = createApplicationStop({
        worker,
        scheduleRunner,
        runStore,
        repository: repository as SqliteWorkspaceRepository,
        database,
        logger,
        logStore,
        project: (run) => projector.project(run),
        reconcile: reconcileDispatches,
      })(deadlineMs);
      return closing;
    },
    async getShellSnapshot(query) {
      ensureDefaultWorkspace();
      return queryShellSnapshot(
        {
          repository,
          runStore,
          models,
          configuredModelKeys,
          defaultModelLabel: defaultModelConfigured
            ? options.model
              ? "Test model"
              : (process.env.OPENROUTER_MODEL ?? "Default model")
            : "Configure a model",
        },
        query,
      );
    },
    getSettingsSnapshot(workspaceId) {
      return settingsStore.get(workspaceId);
    },
    updateSettings(update) {
      if (
        update.workspace?.defaultModel !== undefined &&
        !configuredModelKeys.has(update.workspace.defaultModel)
      )
        throw new Error(
          `Unknown or unconfigured model: ${update.workspace.defaultModel}`,
        );
      const snapshot = settingsStore.update(update);
      for (const listener of invalidationListeners)
        listener({
          scope: "workspace-settings",
          workspaceId: update.workspaceId,
        });
      return snapshot;
    },
    async getConversationSnapshot(query) {
      return queryConversationSnapshot({ repository, runStore }, query);
    },
    async getDispatchSnapshot(dispatchId) {
      return queryDispatchSnapshot(repository, dispatchId);
    },
    async getRunSnapshot(runId) {
      return queryRunSnapshot({ repository, runStore }, runId);
    },
    async dispatch(command) {
      if (stopping && command.type !== "cancel")
        throw Object.assign(new Error("Application is stopping"), {
          code: "APPLICATION_STOPPING",
        });
      logger.info(
        {
          command: command.type,
          workspaceId:
            "workspaceId" in command ? command.workspaceId : undefined,
          conversationId:
            "conversationId" in command ? command.conversationId : undefined,
          runId: "runId" in command ? command.runId : undefined,
        },
        "application command received",
      );
      if (command.type === "workspace.create") {
        return handleWorkspaceCommand(
          repository,
          command,
          publish,
          publishWorkspace,
        );
      }
      if (command.type === "workspace.rename")
        return handleWorkspaceCommand(
          repository,
          command,
          publish,
          publishWorkspace,
        );
      if (command.type === "agent.create") {
        return handleAgentCommand(
          repository,
          command,
          () => runStore.listRuns(),
          normalizeModelKey,
          (input) =>
            validateAgentInput(input, tooling, models, configuredModelKeys),
          (patch) =>
            validateAgentPatch(patch, tooling, models, configuredModelKeys),
          publishWorkspace,
        );
      }
      if (
        command.type === "agent.activate" ||
        command.type === "agent.archive"
      ) {
        return handleAgentCommand(
          repository,
          command,
          () => runStore.listRuns(),
          normalizeModelKey,
          (input) =>
            validateAgentInput(input, tooling, models, configuredModelKeys),
          (patch) =>
            validateAgentPatch(patch, tooling, models, configuredModelKeys),
          publishWorkspace,
        );
      }
      if (command.type === "agent.update")
        return handleAgentCommand(
          repository,
          command,
          () => runStore.listRuns(),
          normalizeModelKey,
          (input) =>
            validateAgentInput(input, tooling, models, configuredModelKeys),
          (patch) =>
            validateAgentPatch(patch, tooling, models, configuredModelKeys),
          publishWorkspace,
        );
      if (
        command.type === "conversation.direct.open" ||
        command.type === "conversation.group.create" ||
        command.type === "conversation.group.rename" ||
        command.type === "conversation.member.add" ||
        command.type === "conversation.member.remove" ||
        command.type === "conversation.create"
      )
        return handleConversationCommand(
          repository,
          command,
          models,
          () => runStore.listRuns(),
          ensureOwner,
          publishWorkspace,
        );
      if (
        command.type === "cancel" ||
        command.type === "retry" ||
        command.type === "approve" ||
        command.type === "reject"
      )
        return handleRunCommand(
          worker,
          tooling,
          command,
          (runId) => runStore.get(runId),
          publishResult,
        );
      if (
        command.type === "schedule.create" ||
        command.type === "schedule.pause" ||
        command.type === "schedule.resume" ||
        command.type === "schedule.delete"
      )
        return handleScheduleCommand(
          repository,
          scheduleRunner,
          command,
          publishWorkspace,
        );
      if (command.type !== "submit") return {};
      return conversationRuns.enqueue(
        `${command.workspaceId}:${command.conversationId}`,
        () => submit(command),
      );
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeSnapshotInvalidated(listener) {
      invalidationListeners.add(listener);
      return () => invalidationListeners.delete(listener);
    },
    getRecentLogs(limit = 100) {
      return logStore?.getRecent(limit) ?? [];
    },
    subscribeLogs(listener) {
      return logStore?.subscribe(listener) ?? (() => undefined);
    },
    getLogPath() {
      return logPath;
    },
  };
  return app;
  async function submit(
    command: Extract<ApplicationCommand, { type: "submit" }>,
  ): Promise<CommandResult> {
    const existingConversation = repository.getConversation(
      command.workspaceId,
      command.conversationId,
    );
    if (!existingConversation)
      throw new Error(`Conversation not found: ${command.conversationId}`);
    const agentId = existingConversation.participantIds.find(
      (id) => id !== "human",
    );
    logger.info(
      {
        workspaceId: command.workspaceId,
        conversationId: command.conversationId,
        agentId,
      },
      "message queued",
    );
    if (!agentId) throw new Error("Conversation has no Agent");
    const conversation = existingConversation;
    const agents = conversation.participantIds
      .filter((id) => id !== "human")
      .map((id) => repository.getParticipant(command.workspaceId, id))
      .filter(
        (participant): participant is Participant =>
          participant?.kind === "agent" && participant.status === "active",
      );
    if (agents.length === 0)
      throw new Error("Conversation has no active Agent");
    const mentionedAgentIds = findMentionedAgentIds(command.body, agents);
    const message = sendMessage(repository, {
      id: randomUUID(),
      workspaceId: command.workspaceId,
      conversationId: command.conversationId,
      senderId: "human",
      body: command.body,
      mentions: mentionedAgentIds,
      createdAt: new Date().toISOString(),
    }).message;
    logger.info(
      {
        workspaceId: command.workspaceId,
        conversationId: command.conversationId,
        agentId,
        messageId: message.id,
      },
      "message submitted",
    );
    const candidates = agents.map((participant) => ({
      agentId: participant.id,
      name: participant.name,
      role: participant.agent?.role ?? "assistant",
      capabilities: participant.agent?.capabilities ?? [],
      toolNames: participant.agent?.toolNames ?? [],
    }));
    const assignments =
      conversation.kind === "group"
        ? await new AgentRouter(
            models.get(conversation.routing?.routerModelKey ?? "default") ??
              model,
          ).route({
            workspaceId: command.workspaceId,
            conversationId: command.conversationId,
            messageId: message.id,
            body: command.body,
            recentContext: buildRoutingContext(
              repository,
              command.workspaceId,
              command.conversationId,
              message.id,
            ),
            candidates,
            maxAgents: conversation.routing?.maxAgents ?? 3,
            fallbackAgentId:
              conversation.routing?.fallbackAgentId ?? agents[0].id,
            mentionedAgentIds,
            onError: (error) =>
              logger.warn(
                {
                  err: error,
                  workspaceId: command.workspaceId,
                  conversationId: command.conversationId,
                  messageId: message.id,
                  routerModel:
                    conversation.routing?.routerModelKey ?? "default",
                  fallbackAgentId:
                    conversation.routing?.fallbackAgentId ?? agents[0].id,
                },
                "conversation router failed; using fallback",
              ),
          })
        : {
            selectedAgentIds: [agents[0].id],
            assignments: [
              {
                agentId: agents[0].id,
                instruction: "Respond to the user's message.",
                reason: "Direct conversation target",
              },
            ],
            source: "mention" as const,
          };
    const dispatchId = `dispatch:${message.id}`;
    repository.saveDispatch({
      id: dispatchId,
      workspaceId: command.workspaceId,
      conversationId: command.conversationId,
      messageId: message.id,
      status: "queued",
      assignments: assignments.assignments.map((assignment) => ({
        ...assignment,
        runId: `run:${message.id}:${assignment.agentId}`,
        status: "queued" as const,
      })),
      createdAt: new Date().toISOString(),
    });
    await publish({
      scope: "conversation",
      workspaceId: command.workspaceId,
      conversationId: command.conversationId,
    });
    const results = await Promise.all(
      assignments.assignments.map(async (assignment) => {
        return enqueueDispatchAssignment(
          {
            ...assignment,
            runId: `run:${message.id}:${assignment.agentId}`,
            status: "queued",
          },
          conversation,
          message,
          assignments.source === "mention" ? "mention" : "routing",
        );
      }),
    );
    const runs = results.filter((run): run is AgentRun => Boolean(run));
    reconcileDispatches(runs);
    for (const run of runs) projector.project(run);
    await publish({
      scope: "dispatch",
      dispatchId,
      workspaceId: command.workspaceId,
    });
    const waiting = runs.filter(requiresApproval);
    if (waiting.length > 0) {
      const terminals = await Promise.all(
        waiting.map((run) => waitForTerminalRun(() => runStore.get(run.runId))),
      );
      for (const run of terminals) if (run) projector.project(run);
      await publish({
        scope: "dispatch",
        dispatchId,
        workspaceId: command.workspaceId,
      });
      const completed = terminals.filter((run): run is AgentRun =>
        Boolean(run),
      );
      return { run: completed.at(-1), runs: completed, created: true };
    }
    return { run: runs.at(-1), runs, created: true };
  }
  async function resumePendingDispatches(): Promise<void> {
    const runs = (await runStore.listRuns()).runs;
    const runIds = new Set(runs.map((run) => run.runId));
    const pending = repository
      .listDispatches()
      .filter((dispatch) =>
        dispatch.assignments.some(
          (assignment) =>
            !runIds.has(assignment.runId) &&
            (assignment.status === "queued" || assignment.status === "running"),
        ),
      );
    for (const dispatch of pending) {
      const conversation = repository.getConversation(
        dispatch.workspaceId,
        dispatch.conversationId,
      );
      const message = repository
        .listMessages(dispatch.workspaceId, dispatch.conversationId)
        .find((item) => item.id === dispatch.messageId);
      if (!conversation || !message) {
        logger.warn(
          {
            dispatchId: dispatch.id,
            workspaceId: dispatch.workspaceId,
            conversationId: dispatch.conversationId,
            messageId: dispatch.messageId,
          },
          "cannot resume Dispatch with missing source records",
        );
        continue;
      }
      const missing = dispatch.assignments.filter(
        (assignment) => !runIds.has(assignment.runId),
      );
      await Promise.all(
        missing.map((assignment) =>
          enqueueDispatchAssignment(
            assignment,
            conversation,
            message,
            message.mentions.length > 0 ? "mention" : "routing",
          ),
        ),
      );
    }
  }
  async function enqueueDispatchAssignment(
    assignment: ConversationDispatch["assignments"][number],
    conversation: Conversation,
    message: Message,
    trigger: "mention" | "routing",
  ): Promise<AgentRun | undefined> {
    const participant = repository.getParticipant(
      message.workspaceId,
      assignment.agentId,
    );
    if (!participant?.agent) {
      logger.warn(
        {
          dispatchId: `dispatch:${message.id}`,
          workspaceId: message.workspaceId,
          conversationId: message.conversationId,
          messageId: message.id,
          agentId: assignment.agentId,
        },
        "cannot enqueue Dispatch assignment for missing Agent",
      );
      return undefined;
    }
    const allMessages = repository.listMessages(
      message.workspaceId,
      message.conversationId,
    );
    const contextMessages = selectConversationContext(
      buildAgentContextMessages(
        allMessages,
        assignment.agentId,
        repository,
        message.workspaceId,
      ),
      50,
    );
    const turnMessages = [
      {
        role: "system" as const,
        content: participant.agent.persona ?? "You are a helpful Agent.",
      },
      ...(conversation.kind === "group"
        ? [
            {
              role: "system" as const,
              content: `Assignment: ${assignment.instruction}`,
            },
          ]
        : []),
      ...contextMessages,
    ];
    const workspaceSettings = settingsStore.get(message.workspaceId).workspace;
    const enqueued = await worker.enqueue({
      runId: assignment.runId,
      turn: { messages: turnMessages },
      dependencies: {
        modelKey: participant.agent.modelKey,
        toolsetKey: "local",
      },
      context: {
        workspaceId: message.workspaceId,
        agentId: assignment.agentId,
        toolNames: participant.agent.toolNames,
        conversationId: message.conversationId,
        trigger: conversation.kind === "direct" ? "direct" : trigger,
        sourceRef: { type: "message", id: message.id },
        writeApproval: workspaceSettings.writeApproval,
        externalApproval: workspaceSettings.externalApproval,
        approvalTimeoutMinutes: workspaceSettings.approvalTimeoutMinutes,
      },
    });
    if (!enqueued.created) return enqueued.run;
    return worker.run(assignment.runId);
  }
  async function publish(
    invalidation: SnapshotInvalidation = { scope: "shell" },
  ): Promise<void> {
    reconcileDispatches((await runStore.listRuns()).runs);
    for (const listener of invalidationListeners) listener(invalidation);
  }

  function publishWorkspace(workspaceId: string): Promise<void> {
    return publish({ scope: "workspace", workspaceId });
  }

  function ensureDefaultWorkspace(): void {
    if (repository.getWorkspace("default")) return;
    const now = new Date().toISOString();
    repository.saveWorkspace({
      id: "default",
      name: "Default Workspace",
      createdAt: now,
      updatedAt: now,
    });
  }
  function migrateLegacyModelKeys(): void {
    for (const workspace of repository.listWorkspaces())
      for (const participant of repository.listParticipants(workspace.id))
        if (participant.agent?.modelKey === "demo")
          repository.saveParticipant({
            ...participant,
            agent: { ...participant.agent, modelKey: "default" },
          });
  }
  async function publishRuntimeUpdate(run: AgentRun): Promise<void> {
    reconcileDispatches((await runStore.listRuns()).runs);
    const scopes: SnapshotInvalidation[] = [
      {
        scope: "run",
        runId: run.runId,
      },
    ];
    const dispatch = repository
      .listDispatches()
      .find((item) =>
        item.assignments.some((assignment) => assignment.runId === run.runId),
      );
    if (dispatch)
      scopes.push({
        scope: "dispatch",
        dispatchId: dispatch.id,
        workspaceId: dispatch.workspaceId,
      });
    if (run.context?.workspaceId && run.context.conversationId) {
      scopes.push({
        scope: "conversation",
        workspaceId: run.context.workspaceId,
        conversationId: run.context.conversationId,
      });
    }
    for (const scope of scopes)
      for (const listener of invalidationListeners) listener(scope);
  }
  function reconcileDispatches(runs: readonly AgentRun[]): void {
    const byRunId = new Map(runs.map((run) => [run.runId, run]));
    for (const dispatch of repository.listDispatches()) {
      const assignments = dispatch.assignments.map((assignment) => ({
        ...assignment,
        status: statusForRun(byRunId.get(assignment.runId)),
      }));
      repository.saveDispatch({
        ...dispatch,
        assignments,
        status: statusForDispatch(assignments),
        ...(isTerminalDispatch(assignments)
          ? { completedAt: dispatch.completedAt ?? new Date().toISOString() }
          : {}),
      });
    }
  }
  async function publishResult(result: CommandResult): Promise<CommandResult> {
    if (result.run) projector.project(result.run);
    await publish();
    return result;
  }
  function ensureOwner(workspaceId: string): void {
    if (!repository.getWorkspace(workspaceId))
      throw new Error(`Workspace not found: ${workspaceId}`);
    if (!repository.getParticipant(workspaceId, "human"))
      repository.saveParticipant({
        id: "human",
        workspaceId,
        kind: "human",
        name: "You",
        status: "active",
      });
  }
}

function statusForRun(run: AgentRun | undefined): DispatchAssignmentStatus {
  if (!run || run.status === "queued") return "queued";
  if (run.status === "running" || run.status === "retrying") return "running";
  if (run.status === "waiting" || run.status === "blocked") return "waiting";
  if (run.status === "completed") return "completed";
  if (run.status === "cancelled" || run.status === "interrupted")
    return "cancelled";
  return "failed";
}

function statusForDispatch(
  assignments: readonly { status: DispatchAssignmentStatus }[],
): ConversationDispatch["status"] {
  if (assignments.some((assignment) => assignment.status === "waiting"))
    return "waiting";
  if (assignments.some((assignment) => assignment.status === "running"))
    return "running";
  if (assignments.some((assignment) => assignment.status === "queued"))
    return "queued";
  if (assignments.every((assignment) => assignment.status === "completed"))
    return "completed";
  if (assignments.some((assignment) => assignment.status === "completed"))
    return "partial";
  return "failed";
}

function isTerminalDispatch(
  assignments: readonly { status: DispatchAssignmentStatus }[],
): boolean {
  return assignments.every(
    (assignment) =>
      assignment.status !== "queued" &&
      assignment.status !== "running" &&
      assignment.status !== "waiting",
  );
}

function requiresApproval(run: AgentRun): boolean {
  if (run.status !== "waiting") return false;
  const details = run.error?.details;
  return (
    typeof details === "object" &&
    details !== null &&
    typeof (details as { approvalId?: unknown }).approvalId === "string"
  );
}

async function waitForTerminalRun(
  getRun: () => Promise<AgentRun | undefined>,
): Promise<AgentRun | undefined> {
  for (;;) {
    const run = await getRun();
    if (!run || !requiresApproval(run)) return run;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function validateAgentInput(
  input: AgentInput,
  tooling: RuntimeTooling,
  models: ReadonlyMap<string, ModelAdapter | StreamingModelAdapter>,
  configuredModelKeys: ReadonlySet<string>,
): void {
  if (!models.has(input.modelKey))
    throw new Error(`Unknown model: ${input.modelKey}`);
  if (!configuredModelKeys.has(input.modelKey))
    throw new Error(`Model is not configured: ${input.modelKey}`);
  validateToolNames(input.toolNames, tooling);
}

function normalizeModelKey(modelKey: string): string {
  return modelKey === "demo" ? "default" : modelKey;
}

function buildRoutingContext(
  repository: WorkspaceRepository,
  workspaceId: string,
  conversationId: string,
  currentMessageId: string,
): readonly { senderId: string; senderName: string; body: string }[] {
  const messages = repository
    .listMessages(workspaceId, conversationId)
    .filter((message) => message.id !== currentMessageId)
    .slice(-20)
    .map((message) => ({
      senderId: message.senderId,
      senderName:
        repository.getParticipant(workspaceId, message.senderId)?.name ??
        message.senderId,
      body: message.body,
    }));
  const budget = 6_000;
  let used = 0;
  const selected: typeof messages = [];
  for (const message of [...messages].reverse()) {
    const size =
      message.senderId.length + message.senderName.length + message.body.length;
    if (selected.length > 0 && used + size > budget) break;
    selected.unshift(message);
    used += size;
  }
  return selected;
}

function validateAgentPatch(
  patch: AgentPatch,
  tooling: RuntimeTooling,
  models: ReadonlyMap<string, ModelAdapter | StreamingModelAdapter>,
  configuredModelKeys: ReadonlySet<string>,
): void {
  if (patch.modelKey !== undefined) {
    if (!models.has(patch.modelKey))
      throw new Error(`Unknown model: ${patch.modelKey}`);
    if (!configuredModelKeys.has(patch.modelKey))
      throw new Error(`Model is not configured: ${patch.modelKey}`);
  }
  if (patch.toolNames !== undefined)
    validateToolNames(patch.toolNames, tooling);
}

function validateToolNames(
  toolNames: readonly string[],
  tooling: RuntimeTooling,
): void {
  const available = tooling.listToolNames?.();
  if (!available) return;
  const known = new Set(available);
  const unknown = toolNames.find((name) => !known.has(name));
  if (unknown) throw new Error(`Unknown tool: ${unknown}`);
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
