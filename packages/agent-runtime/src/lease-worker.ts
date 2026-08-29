import {
  runTurn,
  type TurnResult,
  type TurnStatus,
} from "@shawnden-coder/agent-core";
import { RunNotResumableError } from "./errors.js";
import { transition } from "./lifecycle.js";
import { noRetry, shouldRetry } from "./retry.js";
import { type RunLeaseStore, RunNotFoundError } from "./store/index.js";
import {
  type AgentRun,
  type Clock,
  type EnqueueRunInput,
  type PersistedRunInput,
  type PersistedTurnInput,
  type PersistedTurnResult,
  type RunDependencyResolver,
  type RunStatus,
  type RuntimeEvent,
  type SerializedRunError,
  systemClock,
} from "./types/index.js";

type TurnRunStatus =
  | "completed"
  | "waiting"
  | "blocked"
  | "cancelled"
  | "failed";

export interface LeaseRuntimeWorkerOptions {
  readonly ownerId: string;
  readonly leaseMs: number;
  readonly resolver: RunDependencyResolver;
  readonly clock?: Clock;
  /** 默认每半个 lease 续租一次。 */
  readonly heartbeatIntervalMs?: number;
}

/**
 * 执行持久化 queued Run 的单 Worker。
 *
 * 它只接受可序列化输入；模型、工具和密钥始终由当前进程的 Resolver 提供。
 */
export class LeaseRuntimeWorker {
  private readonly clock: Clock;

  public constructor(
    private readonly store: RunLeaseStore,
    private readonly options: LeaseRuntimeWorkerOptions,
  ) {
    if (!options.ownerId) throw new Error("ownerId must not be empty");
    if (!Number.isFinite(options.leaseMs) || options.leaseMs <= 0) {
      throw new Error("leaseMs must be a positive finite number");
    }
    this.clock = options.clock ?? systemClock;
  }

  /** 入队一个由 Resolver 驱动的 Run；此操作不会立即执行它。 */
  public async enqueue(input: EnqueueRunInput): Promise<AgentRun> {
    const now = this.clock.now();
    const persisted: PersistedRunInput = {
      turn: input.turn,
      dependencies: input.dependencies,
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.retryPolicy === undefined
        ? {}
        : { retryPolicy: input.retryPolicy }),
    };
    const run: AgentRun = {
      runId: input.runId,
      ...(input.context === undefined ? {} : { context: input.context }),
      status: "queued",
      attempt: 1,
      version: 0,
      createdAt: now,
      input: persisted,
    };
    await this.store.createWithEvent(
      run,
      this.event(input.runId, 0, "run_queued", now),
    );
    return run;
  }

  /** 尝试领取并执行一个 queued Run；已被其他 Worker 领取时返回 undefined。 */
  public async run(runId: string): Promise<AgentRun | undefined> {
    const claimed = await this.store.claimAndStart(
      runId,
      this.options.ownerId,
      this.clock.now(),
      this.options.leaseMs,
    );
    if (!claimed) return undefined;

    let current = await this.requireRun(runId);
    const controller = new AbortController();
    let leaseLost = false;
    const stopHeartbeat = this.startHeartbeat(runId, controller, () => {
      leaseLost = true;
    });

    try {
      const persisted = requirePersistedDependencies(current.input);
      const [model, tools] = await Promise.all([
        this.options.resolver.resolveModel(persisted.dependencies.modelKey),
        this.options.resolver.resolveTools(persisted.dependencies.toolsetKey),
      ]);
      const retryPolicy = persisted.retryPolicy ?? noRetry;

      while (!leaseLost) {
        const result = await runTurn(
          { ...persisted.turn, signal: controller.signal },
          { model, tools },
        );
        if (leaseLost) return this.store.get(runId);
        if (!(await this.appendTurnEvents(runId, result)))
          return this.store.get(runId);
        current = await this.requireRun(runId);

        if (
          result.status === "failed" &&
          shouldRetry(result.error, current.attempt, retryPolicy, result)
        ) {
          const retrying = await this.recordTransition(
            current,
            "retrying",
            "run_retrying",
            { attempt: current.attempt },
          );
          if (!retrying) return this.store.get(runId);
          if (
            !(await this.delay(retryPolicy.delayMs ?? 0, controller.signal))
          ) {
            return this.finish(retrying, {
              status: "cancelled",
              messages: [],
              events: [],
              steps: 0,
            });
          }
          const restarted = await this.recordTransition(
            retrying,
            "running",
            "run_restarted",
            { attempt: retrying.attempt + 1 },
            { attempt: retrying.attempt + 1 },
          );
          if (!restarted) return this.store.get(runId);
          current = restarted;
          continue;
        }
        return this.finish(current, result);
      }
      return this.store.get(runId);
    } catch (error) {
      if (leaseLost) return this.store.get(runId);
      const latest = await this.store.get(runId);
      if (!latest || isTerminal(latest.status)) return latest;
      return this.fail(latest, error);
    } finally {
      stopHeartbeat();
    }
  }

  /** 显式恢复 waiting 或 blocked Run，并使用保存的依赖键重新领取执行。 */
  public async resumeRun(
    runId: string,
    turn: PersistedTurnInput,
  ): Promise<AgentRun | undefined> {
    const current = await this.requireRun(runId);
    if (current.status !== "waiting" && current.status !== "blocked") {
      throw new RunNotResumableError(runId, current.status);
    }
    const persisted = requirePersistedDependencies(current.input);
    const events = await this.store.listEvents(runId);
    const next: AgentRun = {
      ...current,
      status: transition(current.status, "queued"),
      attempt: current.attempt + 1,
      version: current.version + 1,
      input: { ...persisted, turn },
    };
    await this.store.transitionWithEvent(
      runId,
      current.version,
      next,
      this.event(
        runId,
        (events.at(-1)?.sequence ?? -1) + 1,
        "run_resumed",
        this.clock.now(),
        { attempt: current.attempt + 1 },
      ),
    );
    return this.run(runId);
  }

  /** 恢复过期 owner 后立即尝试执行恢复出的 queued Run。 */
  public async recoverAndRun(limit: number): Promise<readonly string[]> {
    const recovered = await this.store.recoverExpiredRuns(
      this.clock.now(),
      limit,
    );
    for (const runId of recovered) await this.run(runId);
    return recovered;
  }

  private startHeartbeat(
    runId: string,
    controller: AbortController,
    onLeaseLost: () => void,
  ): () => void {
    const interval =
      this.options.heartbeatIntervalMs ??
      Math.max(1, Math.floor(this.options.leaseMs / 2));
    let renewing = false;
    const timer = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void this.store
        .renewLease(
          runId,
          this.options.ownerId,
          this.clock.now(),
          this.options.leaseMs,
        )
        .then((lease) => {
          if (!lease) {
            onLeaseLost();
            controller.abort();
          }
        })
        .catch(() => {
          onLeaseLost();
          controller.abort();
        })
        .finally(() => {
          renewing = false;
        });
    }, interval);
    return () => clearInterval(timer);
  }

  private async appendTurnEvents(
    runId: string,
    result: TurnResult,
  ): Promise<boolean> {
    if (result.events.length === 0) return true;
    const events = await this.store.listEvents(runId);
    const occurredAt = this.clock.now();
    const firstSequence = (events.at(-1)?.sequence ?? -1) + 1;
    return this.store.appendEventsAsOwner(
      runId,
      this.options.ownerId,
      occurredAt,
      result.events.map((event, index) =>
        this.event(
          runId,
          firstSequence + index,
          `turn.${event.type}`,
          occurredAt,
          event,
        ),
      ),
    );
  }

  private async finish(
    current: AgentRun,
    result: TurnResult,
  ): Promise<AgentRun | undefined> {
    const status = mapTurnStatus(result.status);
    const patch = {
      result: toPersistedTurnResult(result),
      ...(result.error === undefined
        ? {}
        : { error: serializeRunError(result.error) }),
      ...(status === "completed" ||
      status === "cancelled" ||
      status === "failed"
        ? { finishedAt: this.clock.now() }
        : {}),
    };
    return this.recordTransition(
      current,
      status,
      `run_${status}`,
      undefined,
      patch,
      true,
    );
  }

  private async fail(
    current: AgentRun,
    error: unknown,
  ): Promise<AgentRun | undefined> {
    return this.recordTransition(
      current,
      "failed",
      "run_failed",
      { message: serializeRunError(error).message },
      { error: serializeRunError(error), finishedAt: this.clock.now() },
      true,
    );
  }

  private async recordTransition(
    current: AgentRun,
    status: RunStatus,
    eventType: string,
    data?: Readonly<Record<string, unknown>>,
    patch: Partial<AgentRun> = {},
    releaseLease = false,
  ): Promise<AgentRun | undefined> {
    const events = await this.store.listEvents(current.runId);
    const next: AgentRun = {
      ...current,
      ...patch,
      status: transition(current.status, status),
      version: current.version + 1,
    };
    return this.store.transitionAsOwnerWithEvent(
      current.runId,
      this.options.ownerId,
      this.clock.now(),
      current.version,
      next,
      this.event(
        current.runId,
        (events.at(-1)?.sequence ?? -1) + 1,
        eventType,
        this.clock.now(),
        data,
      ),
      { releaseLease },
    );
  }

  private async requireRun(runId: string): Promise<AgentRun> {
    const run = await this.store.get(runId);
    if (!run) throw new RunNotFoundError(runId);
    return run;
  }

  private async delay(delayMs: number, signal: AbortSignal): Promise<boolean> {
    if (delayMs <= 0) return !signal.aborted;
    if (signal.aborted) return false;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(true), delayMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve(false);
        },
        { once: true },
      );
    });
  }

  private event(
    runId: string,
    sequence: number,
    type: string,
    occurredAt: string,
    data?: Readonly<Record<string, unknown>>,
  ): RuntimeEvent {
    return {
      runId,
      sequence,
      type,
      occurredAt,
      ...(data === undefined ? {} : { data }),
    };
  }
}

function requirePersistedDependencies(
  input: PersistedRunInput | undefined,
): PersistedRunInput & {
  readonly dependencies: NonNullable<PersistedRunInput["dependencies"]>;
} {
  if (!input?.dependencies)
    throw new Error("Run has no persisted dependency keys");
  return input as PersistedRunInput & {
    readonly dependencies: NonNullable<PersistedRunInput["dependencies"]>;
  };
}

function mapTurnStatus(status: TurnStatus): TurnRunStatus {
  switch (status) {
    case "done":
      return "completed";
    case "waiting":
    case "needs_clarification":
      return "waiting";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}

function toPersistedTurnResult(result: TurnResult): PersistedTurnResult {
  return {
    status: result.status,
    messages: result.messages,
    steps: result.steps,
  };
}

function serializeRunError(error: unknown): SerializedRunError {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const details =
    error !== null && (typeof error === "object" || typeof error === "function")
      ? (error as { code?: unknown; retryable?: unknown; details?: unknown })
      : {};
  return {
    name: normalized.name,
    message: normalized.message,
    ...(typeof details.code === "string" ? { code: details.code } : {}),
    ...(typeof details.retryable === "boolean"
      ? { retryable: details.retryable }
      : {}),
    ...(details.details === undefined ? {} : { details: details.details }),
  };
}

function isTerminal(status: RunStatus): boolean {
  return (
    status === "completed" || status === "cancelled" || status === "failed"
  );
}
