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
  type RunStatus,
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
  type ConversationDispatch,
  type DispatchAssignmentStatus,
  loadAttention,
  type Participant,
  SqliteWorkspaceRepository,
  sendMessage,
  type WorkspaceRepository,
} from "workspace";
import type { SnapshotInvalidation } from "../shared/contracts/invalidation.js";
import type {
  ConversationQuery,
  ConversationSnapshot,
  RunPhase,
  RunSnapshot,
  ShellSnapshot,
} from "../shared/contracts/snapshot.js";
import {
  type ApplicationLogEntry,
  ApplicationLogStore,
} from "./application-log.js";
import { ConversationRunCoordinator } from "./conversation-run-coordinator.js";
import { AgentRouter } from "./dispatch/agent-router.js";
import {
  buildAgentContextMessages,
  findMentionedAgentIds,
  selectConversationContext,
} from "./dispatch/context-builder.js";
import { CompletionProjector } from "./orchestrator.js";

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
  | { type: "conversation.direct.open"; workspaceId: string; agentId: string }
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
  getShellSnapshot(): Promise<ShellSnapshot>;
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
  const runStore = SqliteRunStore.fromDatabase(database);
  const projector = new CompletionProjector(repository);
  const model = options.model ?? {
    complete: async () => ({
      type: "text" as const,
      content: "演示 Agent 已完成任务。",
    }),
  };
  const tooling = options.tooling ?? createDefaultTooling(database.client);
  const models = new Map<string, ModelAdapter | StreamingModelAdapter>([
    ["demo", model],
    ...Object.entries(options.models ?? {}),
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
  const eventListeners = new Set<(event: ApplicationEvent) => void>();
  const invalidationListeners = new Set<
    (scope: SnapshotInvalidation) => void
  >();
  const conversationRuns = new ConversationRunCoordinator();
  let started = false;
  let stopping = false;
  const app: FastMpaApplication = {
    async start() {
      if (started) return;
      if (stopping) throw new Error("Application has been stopped");
      started = true;
      ensureDefaultWorkspace();
      logger.info("application started");
      worker.startWorkers();
      scheduleRunner.start();
      const persistedRuns = (await runStore.listRuns()).runs;
      projector.projectAll(persistedRuns);
      reconcileDispatches(persistedRuns);
      await publish({ scope: "shell" });
    },
    async stop(deadlineMs = 15_000) {
      if (!started || stopping) return;
      stopping = true;
      started = false;
      const deadline = Date.now() + Math.max(1, deadlineMs);
      try {
        // 先停止新的调度，再取消活动 Run，最后关闭共享 SQLite 连接。
        await withShutdownDeadline(
          scheduleRunner.stop(),
          deadline,
          "schedule runner stop",
          logger,
        );
        const activeRuns = (await runStore.listRuns()).runs.filter((run) =>
          ["queued", "running", "retrying", "waiting", "blocked"].includes(
            run.status,
          ),
        );
        await withShutdownDeadline(
          Promise.all(
            activeRuns.map(async (run) => {
              try {
                const cancelled = await worker.cancel(run.runId);
                if (cancelled) projector.project(cancelled);
              } catch (error: unknown) {
                logger.warn(
                  { err: error, runId: run.runId },
                  "failed to cancel Run during shutdown",
                );
              }
            }),
          ),
          deadline,
          "active Run cancellation",
          logger,
        );
        reconcileDispatches((await runStore.listRuns()).runs);
        await withShutdownDeadline(
          worker.stopWorkers(),
          deadline,
          "runtime worker stop",
          logger,
        );
      } finally {
        runStore.close();
        (repository as SqliteWorkspaceRepository).close();
        database.client.close();
        logger.info("application stopped");
        if (logStore) await logStore.close();
      }
    },
    async getShellSnapshot() {
      ensureDefaultWorkspace();
      const workspaces = repository.listWorkspaces();
      const selectedWorkspaceId = workspaces[0]?.id;
      const attention = selectedWorkspaceId
        ? loadAttention(repository, selectedWorkspaceId, "human")
        : undefined;
      const persistedRuns = (await runStore.listRuns()).runs;
      return {
        workspaces,
        selectedWorkspaceId,
        attention,
        conversations: workspaces.flatMap((workspace) =>
          repository.listConversations(workspace.id).map((conversation) => {
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
                ["queued", "running", "retrying", "waiting"].includes(
                  run.status,
                ),
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
          }),
        ),
        participants: selectedWorkspaceId
          ? repository.listParticipants(selectedWorkspaceId)
          : [],
        schedules: repository.listSchedules(selectedWorkspaceId),
        dispatches: repository.listDispatches(selectedWorkspaceId),
      };
    },
    async getConversationSnapshot(query) {
      const runs = (await runStore.listRuns()).runs
        .filter(
          (run) =>
            run.context?.workspaceId === query.workspaceId &&
            run.context?.conversationId === query.conversationId,
        )
        .map(withPhase);
      const messages = repository.listMessages(
        query.workspaceId,
        query.conversationId,
      );
      const dispatches = repository
        .listDispatches(query.workspaceId)
        .filter((dispatch) => dispatch.conversationId === query.conversationId);
      const conversationRuns = runs.filter(
        (run) => run.context?.conversationId === query.conversationId,
      );
      const events = (
        await Promise.all(
          conversationRuns.map((run) => runStore.listEvents(run.runId)),
        )
      ).flat();
      return {
        conversation: repository.getConversation(
          query.workspaceId,
          query.conversationId,
        ),
        messages,
        runs,
        dispatches,
        events,
      };
    },
    async getDispatchSnapshot(dispatchId) {
      const dispatch = repository
        .listDispatches()
        .find((item) => item.id === dispatchId);
      if (!dispatch) throw new Error(`Dispatch not found: ${dispatchId}`);
      return dispatch;
    },
    async getRunSnapshot(runId) {
      const run = await runStore.get(runId);
      const dispatch =
        run?.context?.sourceRef?.type === "message"
          ? repository
              .listDispatches()
              .find((item) => item.messageId === run.context?.sourceRef?.id)
          : undefined;
      return {
        run: run ? withPhase(run) : undefined,
        dispatch,
        events: run ? await runStore.listEvents(runId) : [],
      };
    },
    async dispatch(command) {
      if (stopping && command.type !== "cancel")
        throw new Error("Application is stopping");
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
      if (command.type === "agent.create") {
        if (!repository.getWorkspace(command.workspaceId))
          throw new Error(`Workspace not found: ${command.workspaceId}`);
        validateAgentInput(command.input, tooling, models);
        const participant = repository.createAgent(
          command.workspaceId,
          command.input,
        );
        await publish();
        return { participant, created: true };
      }
      if (command.type === "agent.update") {
        validateAgentPatch(command.patch, tooling, models);
        const participant = repository.updateAgent(
          command.workspaceId,
          command.agentId,
          command.patch,
        );
        await publish();
        return { participant };
      }
      if (
        command.type === "agent.activate" ||
        command.type === "agent.archive"
      ) {
        if (command.type === "agent.archive") {
          const activeRuns = (await runStore.listRuns()).runs.filter(
            (run) =>
              run.context?.workspaceId === command.workspaceId &&
              run.context.agentId === command.agentId &&
              ["queued", "running", "retrying", "waiting", "blocked"].includes(
                run.status,
              ),
          );
          if (activeRuns.length > 0)
            throw new Error("Agent has active or approval-waiting Runs");
        }
        const participant = repository.setAgentStatus(
          command.workspaceId,
          command.agentId,
          command.type === "agent.activate" ? "active" : "inactive",
        );
        if (command.type === "agent.archive") {
          const groups = repository
            .listConversations(command.workspaceId)
            .filter(
              (conversation) =>
                conversation.kind === "group" &&
                conversation.participantIds.includes(command.agentId),
            );
          if (
            groups.some(
              (conversation) =>
                conversation.participantIds.filter(
                  (id) => id !== "human" && id !== command.agentId,
                ).length === 0,
            )
          )
            throw new Error(
              "Cannot archive the only Agent in a group conversation",
            );
          for (const conversation of groups) {
            const participantIds = conversation.participantIds.filter(
              (id) => id !== command.agentId,
            );
            repository.saveConversation({
              ...conversation,
              participantIds,
              routing:
                conversation.routing?.fallbackAgentId === command.agentId
                  ? {
                      ...conversation.routing,
                      fallbackAgentId: participantIds.find(
                        (id) => id !== "human",
                      ) as string,
                    }
                  : conversation.routing,
            });
          }
        }
        await publish();
        return { participant };
      }
      if (command.type === "conversation.direct.open") {
        ensureOwner(command.workspaceId);
        const agent = repository.getParticipant(
          command.workspaceId,
          command.agentId,
        );
        if (agent?.kind !== "agent" || agent.status !== "active")
          throw new Error(`Active Agent not found: ${command.agentId}`);
        const existing = repository.findDirectConversation(
          command.workspaceId,
          command.agentId,
        );
        if (existing) return { conversationId: existing.id, created: false };
        const id = randomUUID();
        repository.saveConversation({
          id,
          workspaceId: command.workspaceId,
          kind: "direct",
          participantIds: ["human", command.agentId],
          createdAt: new Date().toISOString(),
        });
        await publish();
        return { conversationId: id, created: true };
      }
      if (command.type === "conversation.group.create") {
        const title = command.title.trim();
        if (!title) throw new Error("Group conversation title is required");
        const agentIds = [...new Set(command.agentIds)];
        if (agentIds.length === 0)
          throw new Error("Group conversation needs an Agent");
        ensureOwner(command.workspaceId);
        const agents = agentIds.map((id) =>
          repository.getParticipant(command.workspaceId, id),
        );
        if (
          agents.some(
            (agent) => agent?.kind !== "agent" || agent.status !== "active",
          )
        )
          throw new Error("Group conversation can only include active Agents");
        const fallbackAgentId = command.routing?.fallbackAgentId ?? agentIds[0];
        if (!agentIds.includes(fallbackAgentId))
          throw new Error("Fallback Agent must be a group member");
        const id = randomUUID();
        const maxAgents = Math.min(
          5,
          Math.max(1, command.routing?.maxAgents ?? 3),
        );
        const routerModelKey = command.routing?.routerModelKey ?? "demo";
        if (!models.has(routerModelKey))
          throw new Error(`Unknown model: ${routerModelKey}`);
        repository.saveConversation({
          id,
          workspaceId: command.workspaceId,
          kind: "group",
          title,
          participantIds: ["human", ...agentIds],
          routing: {
            mode: "auto",
            routerModelKey,
            fallbackAgentId,
            maxAgents,
          },
          createdAt: new Date().toISOString(),
        });
        await publish();
        return { conversationId: id, created: true };
      }
      if (command.type === "conversation.group.rename") {
        const conversation = repository.getConversation(
          command.workspaceId,
          command.conversationId,
        );
        if (conversation?.kind !== "group")
          throw new Error("Group conversation not found");
        const title = command.title.trim();
        if (!title) throw new Error("Group conversation title is required");
        repository.saveConversation({ ...conversation, title });
        await publish();
        return {};
      }
      if (
        command.type === "conversation.member.add" ||
        command.type === "conversation.member.remove"
      ) {
        const conversation = repository.getConversation(
          command.workspaceId,
          command.conversationId,
        );
        if (conversation?.kind !== "group")
          throw new Error("Group conversation not found");
        if (command.type === "conversation.member.remove") {
          const activeRuns = (await runStore.listRuns()).runs.filter(
            (run) =>
              run.context?.workspaceId === command.workspaceId &&
              run.context.conversationId === command.conversationId &&
              run.context.agentId === command.agentId &&
              ["queued", "running", "retrying", "waiting", "blocked"].includes(
                run.status,
              ),
          );
          if (activeRuns.length > 0)
            throw new Error(
              "Agent has active or approval-waiting Runs in this conversation",
            );
        }
        const ids =
          command.type === "conversation.member.add"
            ? [
                ...new Set([
                  ...conversation.participantIds,
                  ...command.agentIds,
                ]),
              ]
            : conversation.participantIds.filter(
                (id) => id !== command.agentId,
              );
        const agents = ids
          .filter((id) => id !== "human")
          .map((id) => repository.getParticipant(command.workspaceId, id));
        if (
          agents.some(
            (agent) => agent?.kind !== "agent" || agent.status !== "active",
          )
        )
          throw new Error("Only active Agents can join a group");
        if (agents.length === 0)
          throw new Error("Group conversation needs an Agent");
        repository.saveConversation({
          ...conversation,
          participantIds: ["human", ...ids.filter((id) => id !== "human")],
        });
        await publish();
        return {};
      }
      if (command.type === "conversation.create") {
        if (!repository.getWorkspace(command.workspaceId))
          throw new Error(`Workspace not found: ${command.workspaceId}`);
        const agentId = command.agentId ?? "demo-agent";
        const id = command.conversationId ?? randomUUID();
        if (repository.getConversation(command.workspaceId, id))
          throw new Error(`Conversation already exists: ${id}`);
        ensureWorkspace(command.workspaceId, id, agentId);
        repository.saveConversation({
          id,
          workspaceId: command.workspaceId,
          kind: "group",
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
        if (!repository.getWorkspace(command.workspaceId))
          throw new Error(`Workspace not found: ${command.workspaceId}`);
        const agent = repository.getParticipant(
          command.workspaceId,
          command.agentId,
        );
        if (agent?.kind !== "agent" || agent.status !== "active")
          throw new Error(`Active Agent not found: ${command.agentId}`);
        if (!Number.isFinite(command.intervalMs) || command.intervalMs < 60_000)
          throw new Error("Schedule interval must be at least one minute");
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
    const agentId =
      existingConversation?.kind === "direct"
        ? (existingConversation.participantIds.find((id) => id !== "human") ??
          "demo-agent")
        : (command.agentId ?? "demo-agent");
    logger.info(
      {
        workspaceId: command.workspaceId,
        conversationId: command.conversationId,
        agentId,
      },
      "message queued",
    );
    ensureWorkspace(command.workspaceId, command.conversationId, agentId);
    const conversation = repository.getConversation(
      command.workspaceId,
      command.conversationId,
    );
    if (!conversation) throw new Error("Conversation was not created");
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
            models.get(conversation.routing?.routerModelKey ?? "demo") ?? model,
          ).route({
            workspaceId: command.workspaceId,
            conversationId: command.conversationId,
            messageId: message.id,
            body: command.body,
            recentContext: repository
              .listMessages(command.workspaceId, command.conversationId)
              .slice(-20)
              .map((item) => ({
                senderId: item.senderId,
                senderName:
                  repository.getParticipant(command.workspaceId, item.senderId)
                    ?.name ?? item.senderId,
                body: item.body,
              })),
            candidates,
            maxAgents: conversation.routing?.maxAgents ?? 3,
            fallbackAgentId:
              conversation.routing?.fallbackAgentId ?? agents[0].id,
            mentionedAgentIds,
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
    const allMessages = repository
      .listMessages(command.workspaceId, command.conversationId)
      .map((item) => item);
    const results = await Promise.all(
      assignments.assignments.map(async (assignment) => {
        const runId = `run:${message.id}:${assignment.agentId}`;
        const contextMessages = selectConversationContext(
          buildAgentContextMessages(
            allMessages,
            assignment.agentId,
            repository,
            command.workspaceId,
          ),
          50,
        );
        const assignedAgent = agents.find(
          (agent) => agent.id === assignment.agentId,
        );
        const turnMessages = [
          {
            role: "system" as const,
            content:
              assignedAgent?.agent?.persona ?? "You are a helpful Agent.",
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
        const enqueued = await worker.enqueue({
          runId,
          turn: {
            messages: turnMessages,
          },
          dependencies: {
            modelKey:
              repository.getParticipant(command.workspaceId, assignment.agentId)
                ?.agent?.modelKey ?? "demo",
            toolsetKey: "local",
          },
          context: {
            workspaceId: command.workspaceId,
            agentId: assignment.agentId,
            toolNames:
              repository.getParticipant(command.workspaceId, assignment.agentId)
                ?.agent?.toolNames ?? [],
            conversationId: command.conversationId,
            trigger: conversation.kind === "group" ? "mention" : "mention",
            sourceRef: { type: "message", id: message.id },
          },
        });
        if (!enqueued.created) return enqueued.run;
        return worker.run(runId);
      }),
    );
    const runs = results.filter((run): run is AgentRun => Boolean(run));
    reconcileDispatches(runs);
    for (const run of runs) projector.project(run);
    await publish({ scope: "dispatch", dispatchId });
    const waiting = runs.filter(requiresApproval);
    if (waiting.length > 0) {
      const terminals = await Promise.all(
        waiting.map((run) => waitForTerminalRun(() => runStore.get(run.runId))),
      );
      for (const run of terminals) if (run) projector.project(run);
      await publish({ scope: "dispatch", dispatchId });
      const completed = terminals.filter((run): run is AgentRun =>
        Boolean(run),
      );
      return { run: completed.at(-1), runs: completed, created: true };
    }
    return { run: runs.at(-1), runs, created: true };
  }
  async function publish(
    invalidation: SnapshotInvalidation = { scope: "shell" },
  ): Promise<void> {
    reconcileDispatches((await runStore.listRuns()).runs);
    for (const listener of invalidationListeners) listener(invalidation);
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
    if (dispatch) scopes.push({ scope: "dispatch", dispatchId: dispatch.id });
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
        agent: {
          modelKey: "demo",
          persona: "Helpful local Agent",
          role: "general assistant",
          capabilities: ["general"],
          toolNames: [],
        },
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
        kind: "direct",
        participantIds: ["human", agentId],
        createdAt: new Date().toISOString(),
      });
    // Existing conversations keep their membership invariant; submit never
    // mutates direct or group participants.
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

async function withShutdownDeadline<T>(
  operation: Promise<T>,
  deadline: number,
  phase: string,
  logger: Logger,
): Promise<T | undefined> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    logger.warn({ phase }, "shutdown deadline reached");
    return undefined;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          logger.warn({ phase }, "shutdown phase exceeded deadline");
          resolve(undefined);
        }, remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
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
): void {
  if (!models.has(input.modelKey))
    throw new Error(`Unknown model: ${input.modelKey}`);
  validateToolNames(input.toolNames, tooling);
}

function validateAgentPatch(
  patch: AgentPatch,
  tooling: RuntimeTooling,
  models: ReadonlyMap<string, ModelAdapter | StreamingModelAdapter>,
): void {
  if (patch.modelKey !== undefined && !models.has(patch.modelKey))
    throw new Error(`Unknown model: ${patch.modelKey}`);
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
