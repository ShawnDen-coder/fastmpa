import {
  ToolRegistry as CoreToolRegistry,
  type ToolDefinition,
  ToolExecutionError,
} from "@shawnden-coder/agent-core";
import type { ToolPipeline } from "./pipeline.js";

export type ToolEffect = "read" | "write";
export type ToolScope = "local" | "external";

export interface RegisteredTool {
  definition: ToolDefinition;
  effect: ToolEffect;
  scope?: ToolScope;
  execute(
    arguments_: Readonly<Record<string, unknown>>,
  ): unknown | Promise<unknown>;
}

export class ToolCatalog {
  private readonly tools = new Map<string, RegisteredTool>();

  public register(tool: RegisteredTool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool already registered: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  public get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  public list(): readonly RegisteredTool[] {
    return [...this.tools.values()];
  }
}

/** @deprecated Runtime callers should use ToolCatalog. */
export { ToolCatalog as ToolRegistry };

/** 将 Pipeline 的注册表投影为 Core 只读执行接口；审批仍由 Pipeline 调用方负责。 */
export function toCoreToolRegistry(
  tools: readonly RegisteredTool[],
  options: {
    readonly pipeline?: ToolPipeline;
    readonly actorId?: string;
    readonly idempotencyKeyPrefix?: string;
    readonly workspaceId?: string;
    readonly writeApproval?: "always" | "external";
    readonly externalApproval?: boolean;
    readonly approvalTimeoutMinutes?: number;
  } = {},
): CoreToolRegistry {
  const registry = new CoreToolRegistry();
  for (const tool of tools) {
    if (tool.effect !== "read" && !options.pipeline)
      throw new Error(
        `Only read tools can be projected into Agent Core: ${tool.definition.name}`,
      );
    registry.register({
      definition: tool.definition,
      validate: (argumentsValue) => {
        if (
          typeof argumentsValue !== "object" ||
          argumentsValue === null ||
          Array.isArray(argumentsValue)
        )
          throw new Error("Tool arguments must be an object");
      },
      execute: async (argumentsValue) => {
        const record = argumentsValue as Readonly<Record<string, unknown>>;
        if (!options.pipeline) return tool.execute(record);
        if (!options.actorId)
          throw new Error("actorId is required for Pipeline-backed Core tools");
        const call = {
          id: `${options.idempotencyKeyPrefix ?? "core"}:${tool.definition.name}`,
          name: tool.definition.name,
          arguments: JSON.stringify(record),
        };
        const result = await options.pipeline.execute(call, {
          actorId: options.actorId,
          idempotencyKey: `${options.idempotencyKeyPrefix ?? "core"}:${tool.definition.name}:${JSON.stringify(record)}`,
          runId: options.idempotencyKeyPrefix ?? "core",
          workspaceId: options.workspaceId,
          writeApproval: options.writeApproval,
          externalApproval: options.externalApproval,
          approvalTimeoutMinutes: options.approvalTimeoutMinutes,
        });
        if (result.status === "approval_required")
          throw new ToolExecutionError(
            "approval_required",
            `Approval required for ${tool.definition.name}`,
            false,
            { approvalId: result.approval.approvalId },
          );
        if (!result.result.ok)
          throw new ToolExecutionError(
            result.result.error.code,
            result.result.error.message,
            result.result.error.retryable,
            result.result.error.details,
          );
        return result.result.content;
      },
    });
  }
  return registry;
}
