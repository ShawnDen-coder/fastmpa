import type { ToolCall, ToolResult } from "@shawnden-coder/agent-core";
import {
  type ApprovalRequest,
  type ApprovalStore,
  InMemoryApprovalStore,
} from "./approval-store.js";
import { defaultToolPolicy, type ToolPolicy } from "./policy.js";
import type { RegisteredTool, ToolRegistry } from "./registry.js";

export interface ToolExecutionOptions {
  actorId: string;
  idempotencyKey: string;
  runId: string;
}

export interface ToolJournalEntry {
  journalId: string;
  toolCallId: string;
  toolName: string;
  actorId: string;
  idempotencyKey: string;
  status: "succeeded" | "failed" | "denied" | "approval_required";
}

export type PipelineResult =
  | { status: "completed"; result: ToolResult }
  | { status: "approval_required"; approval: ApprovalRequest }
  | { status: "rejected"; result: ToolResult };

export class ToolPipeline {
  private readonly results = new Map<string, ToolResult>();
  private readonly journal: ToolJournalEntry[] = [];
  private sequence = 0;

  public constructor(
    private readonly registry: ToolRegistry,
    private readonly policy: ToolPolicy = defaultToolPolicy,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly approvalStore: ApprovalStore = new InMemoryApprovalStore(),
  ) {}

  public async execute(
    call: ToolCall,
    options: ToolExecutionOptions,
  ): Promise<PipelineResult> {
    const cached =
      this.results.get(options.idempotencyKey) ??
      this.approvalStore.getResult?.(options.idempotencyKey);
    if (cached) return { status: "completed", result: cached };
    const tool = this.registry.get(call.name);
    if (!tool)
      return this.failure(
        call,
        options,
        "tool_not_found",
        `Tool not found: ${call.name}`,
      );
    let arguments_: Readonly<Record<string, unknown>>;
    try {
      const parsed: unknown = JSON.parse(call.arguments);
      if (!isRecord(parsed)) throw new Error("Arguments must be a JSON object");
      validateArguments(tool.definition.parameters, parsed);
      arguments_ = parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(
        call,
        options,
        call.arguments.trim().startsWith("{")
          ? "invalid_arguments"
          : "invalid_json",
        message,
      );
    }
    const decision = this.policy.decide(tool, options.actorId);
    if (decision === "deny")
      return this.failure(
        call,
        options,
        "policy_denied",
        "Tool call denied by policy",
        "denied",
      );
    if (decision === "require_approval") {
      const approval: ApprovalRequest = {
        approvalId: this.createId(),
        runId: options.runId,
        toolCall: call,
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
      };
      this.approvalStore.save(approval);
      this.record(call, options, "approval_required");
      return { status: "approval_required", approval };
    }
    return this.runTool(call, options, tool, arguments_);
  }

  public async approve(
    approvalId: string,
    runId: string,
  ): Promise<PipelineResult> {
    const pending = this.approvalStore.get(approvalId);
    if (!pending) throw new Error(`Approval not found: ${approvalId}`);
    if (runId !== undefined && pending.runId !== runId)
      throw new Error(`Approval ${approvalId} belongs to Run ${pending.runId}`);
    const tool = this.registry.get(pending.toolCall.name);
    if (!tool) throw new Error(`Tool not found: ${pending.toolCall.name}`);
    this.approvalStore.remove(approvalId);
    const arguments_ = JSON.parse(pending.toolCall.arguments) as Readonly<
      Record<string, unknown>
    >;
    return this.runTool(
      pending.toolCall,
      {
        actorId: pending.actorId,
        idempotencyKey: pending.idempotencyKey,
        runId: pending.runId,
      },
      tool,
      arguments_,
    );
  }

  public reject(approvalId: string, runId: string): PipelineResult {
    const pending = this.approvalStore.get(approvalId);
    if (!pending) throw new Error(`Approval not found: ${approvalId}`);
    if (!runId || pending.runId !== runId)
      throw new Error(`Approval ${approvalId} belongs to Run ${pending.runId}`);
    this.approvalStore.remove(approvalId);
    return {
      status: "rejected",
      result: {
        ok: false,
        toolCallId: pending.toolCall.id,
        name: pending.toolCall.name,
        content: "Tool call rejected by user",
        error: {
          code: "policy_denied",
          message: "Tool call rejected by user",
          retryable: false,
        },
      },
    };
  }

  public listJournal(): readonly ToolJournalEntry[] {
    return this.approvalStore.listJournal?.() ?? [...this.journal];
  }

  private async runTool(
    call: ToolCall,
    options: ToolExecutionOptions,
    tool: RegisteredTool,
    arguments_: Readonly<Record<string, unknown>>,
  ): Promise<PipelineResult> {
    try {
      const output = await tool.execute(arguments_);
      const result: ToolResult = {
        ok: true,
        toolCallId: call.id,
        name: call.name,
        content: typeof output === "string" ? output : JSON.stringify(output),
      };
      this.results.set(options.idempotencyKey, result);
      this.approvalStore.saveResult?.(options.idempotencyKey, result);
      this.record(call, options, "succeeded");
      return { status: "completed", result };
    } catch (error) {
      return this.failure(
        call,
        options,
        "execution_failed",
        error instanceof Error ? error.message : String(error),
        "failed",
        tool.effect === "read" && isRetryableError(error),
        getErrorDetails(error),
      );
    }
  }

  private failure(
    call: ToolCall,
    options: ToolExecutionOptions,
    code:
      | "tool_not_found"
      | "invalid_json"
      | "invalid_arguments"
      | "execution_failed"
      | "policy_denied",
    message: string,
    status: "failed" | "denied" = "failed",
    retryable = false,
    details?: unknown,
  ): PipelineResult {
    const result: ToolResult = {
      ok: false,
      toolCallId: call.id,
      name: call.name,
      content: message,
      error: {
        code,
        message,
        retryable,
        ...(details === undefined ? {} : { details }),
      },
    };
    this.record(call, options, status);
    return { status: status === "denied" ? "rejected" : "completed", result };
  }

  private record(
    call: ToolCall,
    options: ToolExecutionOptions,
    status: ToolJournalEntry["status"],
  ): void {
    this.journal.push({
      journalId: `journal-${++this.sequence}`,
      toolCallId: call.id,
      toolName: call.name,
      actorId: options.actorId,
      idempotencyKey: options.idempotencyKey,
      status,
    });
    this.approvalStore.appendJournal?.(this.journal.at(-1) as ToolJournalEntry);
  }
}

function isRetryableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  );
}

function getErrorDetails(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const details = error as {
    code?: unknown;
    statusCode?: unknown;
    info?: unknown;
  };
  if (
    typeof details.code !== "string" &&
    typeof details.statusCode !== "number"
  )
    return undefined;
  return {
    ...(typeof details.code === "string" ? { code: details.code } : {}),
    ...(typeof details.statusCode === "number"
      ? { statusCode: details.statusCode }
      : {}),
    ...(typeof details.info === "string" ? { info: details.info } : {}),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateArguments(
  parameters: Readonly<Record<string, unknown>>,
  arguments_: Readonly<Record<string, unknown>>,
): void {
  const required = parameters.required;
  if (!Array.isArray(required)) return;
  for (const name of required) {
    if (typeof name === "string" && !(name in arguments_))
      throw new Error(`Missing required argument: ${name}`);
  }
}
