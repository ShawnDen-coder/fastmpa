import type { ToolRegistry as CoreToolRegistry } from "@shawnden-coder/agent-core";
import type { RunExecutionContext } from "../types/dependencies.js";
import { ToolPipeline } from "./pipeline.js";
import { defaultToolPolicy } from "./policy.js";
import { ToolCatalog, toCoreToolRegistry } from "./registry.js";

export type ToolApprovalResult = import("./pipeline.js").PipelineResult;

export interface RuntimeTooling {
  resolveTools(context: RunExecutionContext): CoreToolRegistry;
  listToolNames?(): readonly string[];
  approve(approvalId: string, runId: string): Promise<ToolApprovalResult>;
  reject(
    approvalId: string,
    runId: string,
    reason?: string,
  ): ToolApprovalResult;
  expireApprovals?(): readonly { approvalId: string; runId: string }[];
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
    const tools = context.toolNames
      ? this.catalog
          .list()
          .filter((tool) => context.toolNames?.includes(tool.definition.name))
      : this.catalog.list();
    return toCoreToolRegistry(tools, {
      pipeline: this.pipeline,
      actorId: context.agentId ?? "system",
      idempotencyKeyPrefix: context.runId,
      workspaceId: context.workspaceId,
      writeApproval: context.writeApproval,
      externalApproval: context.externalApproval,
      approvalTimeoutMinutes: context.approvalTimeoutMinutes,
    });
  }

  public listToolNames(): readonly string[] {
    return this.catalog.list().map((tool) => tool.definition.name);
  }

  public approve(approvalId: string, runId: string) {
    return this.pipeline.approve(approvalId, runId);
  }

  public reject(approvalId: string, runId: string, reason?: string) {
    return this.pipeline.reject(approvalId, runId, reason);
  }

  public expireApprovals(): readonly { approvalId: string; runId: string }[] {
    return this.pipeline.expireApprovals();
  }
}
