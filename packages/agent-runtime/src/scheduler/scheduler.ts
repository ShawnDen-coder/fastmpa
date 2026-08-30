import type { WorkspaceChange, WorkspaceRepository } from "workspace";
import { loadAttention, markConversationRead } from "workspace";
import type { AgentRun, EnqueueRunInput } from "../types/index.js";
import {
  InMemoryWorkClaimStore,
  type WorkClaim,
  type WorkClaimStore,
} from "./claim.js";
import { assembleAgentContext, contextMessages } from "./context.js";
import { shouldWake } from "./triage.js";

export interface WakeSignal {
  wakeId: string;
  workspaceId: string;
  agentId: string;
  reason: "mention" | "assignment" | "schedule";
  sourceRef: { type: "message" | "card" | "schedule"; id: string };
}

export interface RuntimeDispatcher {
  enqueue(input: EnqueueRunInput): Promise<unknown>;
}

export interface RuntimeProcessor extends RuntimeDispatcher {
  run(runId: string): Promise<AgentRun | undefined>;
}

export interface AgentSchedulerOptions {
  repository: WorkspaceRepository;
  runtime: RuntimeDispatcher;
  createId?: () => string;
  modelKey: string;
  toolsetKey: string;
  claimStore?: WorkClaimStore;
  claimLeaseMs?: number;
  now?: () => number;
}

export class AgentScheduler {
  private readonly pending = new Map<string, WakeSignal>();
  private readonly createId: () => string;
  private readonly claimStore: WorkClaimStore;
  private readonly claimLeaseMs: number;
  private readonly now: () => number;

  public constructor(private readonly options: AgentSchedulerOptions) {
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.claimStore =
      options.claimStore ?? new InMemoryWorkClaimStore(this.createId);
    this.claimLeaseMs = options.claimLeaseMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  public notify(change: WorkspaceChange): readonly WakeSignal[] {
    return change.candidateAgentIds.map((agentId) => {
      const pendingKey = `${change.workspaceId}:${agentId}`;
      const existing = this.pending.get(pendingKey);
      if (existing) return existing;
      const reason =
        change.kind === "message.created" ? "mention" : "assignment";
      const sourceType = change.kind === "message.created" ? "message" : "card";
      const signal: WakeSignal = {
        wakeId: this.createId(),
        workspaceId: change.workspaceId,
        agentId,
        reason,
        sourceRef: { type: sourceType, id: change.sourceId },
      };
      this.pending.set(pendingKey, signal);
      return signal;
    });
  }

  /** 周期任务只负责唤醒 Agent；实际业务仍由 Agent 的 Tools 决定。 */
  public notifySchedule(input: {
    scheduleId: string;
    workspaceId: string;
    agentId: string;
  }): WakeSignal {
    const pendingKey = `${input.workspaceId}:${input.agentId}`;
    const existing = this.pending.get(pendingKey);
    if (existing) return existing;
    const signal: WakeSignal = {
      wakeId: this.createId(),
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      reason: "schedule",
      sourceRef: { type: "schedule", id: input.scheduleId },
    };
    this.pending.set(pendingKey, signal);
    return signal;
  }

  public async dispatch(signal: WakeSignal): Promise<unknown> {
    const claim = this.acquireClaim(signal);
    if (!claim) return undefined;
    const snapshot = loadAttention(
      this.options.repository,
      signal.workspaceId,
      signal.agentId,
    );
    if (signal.reason !== "schedule" && !shouldWake(snapshot)) {
      this.releaseClaim(claim, signal.wakeId);
      return undefined;
    }
    const result = await this.options.runtime.enqueue(
      this.createEnqueueInput(signal, snapshot),
    );
    this.pending.delete(`${signal.workspaceId}:${signal.agentId}`);
    return result;
  }

  public async dispatchAndRun(
    signal: WakeSignal,
  ): Promise<AgentRun | undefined> {
    const claim = this.acquireClaim(signal);
    if (!claim) return undefined;
    const snapshot = loadAttention(
      this.options.repository,
      signal.workspaceId,
      signal.agentId,
    );
    if (signal.reason !== "schedule" && !shouldWake(snapshot)) {
      this.releaseClaim(claim, signal.wakeId);
      return undefined;
    }
    const runtime = this.options.runtime as RuntimeProcessor;
    if (typeof runtime.run !== "function") {
      this.releaseClaim(claim, signal.wakeId);
      throw new Error("Runtime dispatcher does not support execution");
    }
    try {
      await runtime.enqueue(this.createEnqueueInput(signal, snapshot));
      const run = await runtime.run(signal.wakeId);
      if (run?.status === "completed") {
        const byConversation = new Map<string, number>();
        for (const message of snapshot.inbox) {
          byConversation.set(
            message.conversationId,
            Math.max(
              byConversation.get(message.conversationId) ?? 0,
              message.sequence,
            ),
          );
        }
        for (const [conversationId, lastSequence] of byConversation) {
          markConversationRead(
            this.options.repository,
            signal.workspaceId,
            signal.agentId,
            conversationId,
            lastSequence,
          );
        }
      }
      return run;
    } finally {
      this.releaseClaim(claim, signal.wakeId);
      this.pending.delete(`${signal.workspaceId}:${signal.agentId}`);
    }
  }

  private acquireClaim(signal: WakeSignal): WorkClaim | undefined {
    return this.claimStore.acquire({
      workKey: `${signal.workspaceId}:${signal.agentId}:${signal.sourceRef.type}:${signal.sourceRef.id}`,
      ownerId: signal.wakeId,
      now: this.now(),
      leaseMs: this.claimLeaseMs,
    });
  }

  private releaseClaim(claim: WorkClaim, ownerId: string): void {
    this.claimStore.release(claim.claimId, ownerId);
  }

  private createEnqueueInput(
    signal: WakeSignal,
    snapshot: ReturnType<typeof loadAttention>,
  ): EnqueueRunInput {
    const agent = this.options.repository.getParticipant(
      snapshot.workspaceId,
      snapshot.agentId,
    );
    if (agent?.kind !== "agent")
      throw new Error(
        `Agent ${snapshot.agentId} is not in workspace ${snapshot.workspaceId}`,
      );
    const schedule =
      signal.reason === "schedule"
        ? this.options.repository.getSchedule(
            signal.workspaceId,
            signal.sourceRef.id,
          )
        : undefined;
    const contextWithSchedule = assembleAgentContext(
      snapshot,
      signal,
      agent,
      schedule,
    );
    return {
      runId: signal.wakeId,
      turn: {
        messages: contextMessages(contextWithSchedule),
        metadata: {
          workspaceId: signal.workspaceId,
          agentId: signal.agentId,
          wakeId: signal.wakeId,
        },
      },
      dependencies: {
        modelKey: contextWithSchedule.model ?? this.options.modelKey,
        toolsetKey: this.options.toolsetKey,
      },
      context: {
        agentId: signal.agentId,
        workspaceId: signal.workspaceId,
        trigger: signal.reason,
        ...(signal.reason === "mention" && signal.sourceRef.type === "message"
          ? {
              conversationId: this.options.repository
                .listConversations(signal.workspaceId)
                .find((conversation) =>
                  this.options.repository
                    .listMessages(signal.workspaceId, conversation.id)
                    .some((message) => message.id === signal.sourceRef.id),
                )?.id,
            }
          : {}),
        sourceRef: signal.sourceRef,
      },
    };
  }

  public pendingWake(
    workspaceId: string,
    agentId: string,
  ): WakeSignal | undefined {
    return this.pending.get(`${workspaceId}:${agentId}`);
  }
}
