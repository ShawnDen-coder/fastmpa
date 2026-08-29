import type { ToolCall } from "@shawnden-coder/agent-core";
import {
  auditRequirementIterations,
  buildIterationAuditMessage,
  formatTapdUpdateReceipt,
  formatTapdUpdateRecovery,
  type IterationAuditReport,
  type TapdReadonlyClient,
  type TapdUpdateReceipt,
  type TapdUpdateRecovery,
  verifyTapdUpdate,
} from "integrations";
import type { PipelineResult, ToolPipeline } from "tool-pipeline";
import type { WorkspaceRepository } from "workspace";
import { sendMessage } from "workspace";

export interface TapdAuditWorkflowOptions {
  repository: WorkspaceRepository;
  client: TapdReadonlyClient;
  pipeline: ToolPipeline;
  workspaceId: string;
  conversationId: string;
  agentId: string;
  createId: () => string;
  now: () => string;
}

export type TapdAuditWorkflowResult =
  | { status: "completed"; report: IterationAuditReport }
  | { status: "waiting"; report: IterationAuditReport; messageId: string };

export class TapdAuditWorkflow {
  public constructor(private readonly options: TapdAuditWorkflowOptions) {}

  public async inspect(input: {
    projectId: string;
    expectedIteration: string;
  }): Promise<TapdAuditWorkflowResult> {
    const report = await auditRequirementIterations(this.options.client, input);
    if (report.findings.length === 0) return { status: "completed", report };
    const message = buildIterationAuditMessage(report, {
      id: this.options.createId(),
      workspaceId: this.options.workspaceId,
      conversationId: this.options.conversationId,
      senderId: this.options.agentId,
      createdAt: this.options.now(),
    });
    sendMessage(this.options.repository, message);
    return { status: "waiting", report, messageId: message.id };
  }

  public requestUpdate(
    call: ToolCall,
    idempotencyKey: string,
  ): Promise<PipelineResult> {
    return this.options.pipeline.execute(call, {
      actorId: this.options.agentId,
      idempotencyKey,
    });
  }

  public approveUpdate(approvalId: string): Promise<PipelineResult> {
    return this.options.pipeline.approve(approvalId).then((result) => {
      sendMessage(this.options.repository, {
        id: this.options.createId(),
        workspaceId: this.options.workspaceId,
        conversationId: this.options.conversationId,
        senderId: this.options.agentId,
        body: formatUpdateResult(result),
        createdAt: this.options.now(),
      });
      return result;
    });
  }

  public async verifyUpdate(input: {
    projectId: string;
    requirementId: string;
    expectedIteration: string | null;
    targetIteration: string;
  }): Promise<TapdUpdateRecovery> {
    const recovery = await verifyTapdUpdate(this.options.client, input);
    sendMessage(this.options.repository, {
      id: this.options.createId(),
      workspaceId: this.options.workspaceId,
      conversationId: this.options.conversationId,
      senderId: this.options.agentId,
      body: formatTapdUpdateRecovery(recovery),
      createdAt: this.options.now(),
    });
    return recovery;
  }
}

function formatUpdateResult(result: PipelineResult): string {
  if (result.status !== "completed")
    return `TAPD 更新未执行：${result.status}。未自动重试，请人工确认。`;
  if (!result.result.ok)
    return `TAPD 更新执行失败：${result.result.error.message}。未自动重试，请人工确认。`;
  try {
    return formatTapdUpdateReceipt(
      JSON.parse(result.result.content) as TapdUpdateReceipt,
    );
  } catch {
    return `TAPD 更新已执行，平台返回：${result.result.content}`;
  }
}
