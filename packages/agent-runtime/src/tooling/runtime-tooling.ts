import type { ToolRegistry as CoreToolRegistry } from "@shawnden-coder/agent-core";
import type { RunExecutionContext } from "../types/dependencies.js";
import { ToolPipeline } from "./pipeline.js";
import { defaultToolPolicy } from "./policy.js";
import { ToolCatalog, toCoreToolRegistry } from "./registry.js";

export interface RuntimeTooling {
  resolveTools(context: RunExecutionContext): CoreToolRegistry;
  approve(
    approvalId: string,
    runId: string,
  ): Promise<import("./pipeline.js").PipelineResult>;
  reject(
    approvalId: string,
    runId: string,
  ): import("./pipeline.js").PipelineResult;
}

export class DefaultRuntimeTooling implements RuntimeTooling {
  public constructor(
    private readonly catalog: ToolCatalog = new ToolCatalog(),
    private readonly pipeline: ToolPipeline = new ToolPipeline(
      catalog,
      defaultToolPolicy,
    ),
  ) {}

  public resolveTools(context: RunExecutionContext): CoreToolRegistry {
    return toCoreToolRegistry(this.catalog.list(), {
      pipeline: this.pipeline,
      actorId: context.agentId ?? "system",
      idempotencyKeyPrefix: context.runId,
    });
  }

  public approve(approvalId: string, runId: string) {
    return this.pipeline.approve(approvalId, runId);
  }

  public reject(approvalId: string, runId: string) {
    return this.pipeline.reject(approvalId, runId);
  }
}
