import type { ToolDefinition } from "@shawnden-coder/agent-core";
import { evaluateRequirementIteration } from "apm";
import type { RegisteredTool } from "tool-pipeline";

export interface TapdRequirement {
  id: string;
  title: string;
  iteration?: string | null;
  projectId: string;
  url?: string;
}

export interface TapdRequirementPage {
  items: readonly TapdRequirement[];
  nextPage?: number;
}

export interface TapdReadonlyClient {
  listRequirements(input: {
    projectId: string;
    page: number;
    pageSize: number;
  }): Promise<TapdRequirementPage>;
}

export interface TapdWriteClient extends TapdReadonlyClient {
  updateRequirementIteration(input: {
    projectId: string;
    requirementId: string;
    expectedIteration: string | null;
    newIteration: string;
  }): Promise<{ receiptId: string; requirementId: string; iteration: string }>;
}

export interface TapdUpdateReceipt {
  receiptId: string;
  requirementId: string;
  iteration: string;
}

export type TapdUpdateRecoveryOutcome = "applied" | "not_applied" | "conflict";

export interface TapdUpdateRecovery {
  requirementId: string;
  expectedIteration: string | null;
  targetIteration: string;
  currentIteration: string | null;
  outcome: TapdUpdateRecoveryOutcome;
}

export interface IterationFinding {
  requirementId: string;
  title: string;
  currentIteration: string | null;
  reason: "missing" | "unexpected";
  url?: string;
}

export interface IterationAuditReport {
  projectId: string;
  expectedIteration: string;
  inspectedCount: number;
  findings: readonly IterationFinding[];
}

export function formatIterationAuditReport(
  report: IterationAuditReport,
): string {
  if (report.findings.length === 0) {
    return `TAPD 项目 ${report.projectId} 共检查 ${report.inspectedCount} 条需求，迭代字段全部符合「${report.expectedIteration}」。`;
  }
  const findings = report.findings
    .map(
      (finding) =>
        `- ${finding.requirementId} ${finding.title}: ${finding.reason === "missing" ? "缺少迭代" : `当前为「${finding.currentIteration}」`}`,
    )
    .join("\n");
  return `TAPD 项目 ${report.projectId} 共检查 ${report.inspectedCount} 条需求，发现 ${report.findings.length} 条异常。\n期望迭代：${report.expectedIteration}\n\n${findings}\n\n以上仅为检查结果，修改前需要你的确认。`;
}

export interface AuditReportMessageInput {
  id: string;
  workspaceId: string;
  conversationId: string;
  senderId: string;
  createdAt: string;
}

export function buildIterationAuditMessage(
  report: IterationAuditReport,
  input: AuditReportMessageInput,
): AuditReportMessageInput & { body: string; mentions: readonly string[] } {
  return { ...input, body: formatIterationAuditReport(report), mentions: [] };
}

export function formatTapdUpdateReceipt(receipt: TapdUpdateReceipt): string {
  return `TAPD 需求 ${receipt.requirementId} 已更新为迭代「${receipt.iteration}」，平台回执：${receipt.receiptId}。`;
}

export function formatTapdUpdateRecovery(recovery: TapdUpdateRecovery): string {
  const outcome = {
    applied: "确认已完成",
    not_applied: "确认尚未完成，可在人工确认后重新提交",
    conflict: "发现其他变更，需要人工处理",
  }[recovery.outcome];
  return `TAPD 需求 ${recovery.requirementId} 写入结果核查：${outcome}。当前迭代：${recovery.currentIteration ?? "未设置"}，目标迭代：${recovery.targetIteration}。`;
}

export async function verifyTapdUpdate(
  client: TapdReadonlyClient,
  input: {
    projectId: string;
    requirementId: string;
    expectedIteration: string | null;
    targetIteration: string;
  },
): Promise<TapdUpdateRecovery> {
  let page = 1;
  let requirement: TapdRequirement | undefined;
  while (!requirement) {
    const result = await client.listRequirements({
      projectId: input.projectId,
      page,
      pageSize: 200,
    });
    requirement = result.items.find((item) => item.id === input.requirementId);
    if (requirement || result.nextPage === undefined) break;
    if (result.nextPage <= page)
      throw new Error("TAPD client returned a non-increasing page cursor");
    page = result.nextPage;
  }
  if (!requirement)
    throw new Error(`TAPD requirement not found: ${input.requirementId}`);
  const currentIteration = requirement.iteration ?? null;
  const outcome: TapdUpdateRecoveryOutcome =
    currentIteration === input.targetIteration
      ? "applied"
      : currentIteration === input.expectedIteration
        ? "not_applied"
        : "conflict";
  return {
    requirementId: input.requirementId,
    expectedIteration: input.expectedIteration,
    targetIteration: input.targetIteration,
    currentIteration,
    outcome,
  };
}

export async function auditRequirementIterations(
  client: TapdReadonlyClient,
  input: { projectId: string; expectedIteration: string; pageSize?: number },
): Promise<IterationAuditReport> {
  const findings: IterationFinding[] = [];
  let page = 1;
  let inspectedCount = 0;
  while (true) {
    const result = await client.listRequirements({
      projectId: input.projectId,
      page,
      pageSize: input.pageSize ?? 100,
    });
    for (const requirement of result.items) {
      inspectedCount += 1;
      const currentIteration = requirement.iteration ?? null;
      const violation = evaluateRequirementIteration(
        {
          id: requirement.id,
          title: requirement.title,
          projectId: requirement.projectId,
          iterationId: currentIteration,
          ...(requirement.url === undefined
            ? {}
            : { externalUrl: requirement.url }),
        },
        {
          projectId: input.projectId,
          expectedIterationId: input.expectedIteration,
        },
      );
      if (violation) {
        findings.push({
          requirementId: violation.requirementId,
          title: violation.title,
          currentIteration: violation.currentIterationId,
          reason: violation.reason,
          url: violation.externalUrl,
        });
      }
    }
    if (result.nextPage === undefined) break;
    if (result.nextPage <= page)
      throw new Error("TAPD client returned a non-increasing page cursor");
    page = result.nextPage;
  }
  return {
    projectId: input.projectId,
    expectedIteration: input.expectedIteration,
    inspectedCount,
    findings,
  };
}

const listDefinition: ToolDefinition = {
  name: "tapd.auditRequirementIterations",
  description:
    "Inspect all TAPD requirements in a project and report unexpected iteration values.",
  parameters: {
    type: "object",
    required: ["projectId", "expectedIteration"],
    properties: {
      projectId: { type: "string" },
      expectedIteration: { type: "string" },
    },
  },
};

export function createTapdReadonlyTools(
  client: TapdReadonlyClient,
): readonly RegisteredTool[] {
  return [
    {
      definition: listDefinition,
      effect: "read",
      execute: async (arguments_) =>
        auditRequirementIterations(client, {
          projectId: requireString(arguments_, "projectId"),
          expectedIteration: requireString(arguments_, "expectedIteration"),
        }),
    },
  ];
}

export function createTapdWriteTools(
  client: TapdWriteClient,
): readonly RegisteredTool[] {
  return [
    {
      definition: {
        name: "tapd.updateRequirementIteration",
        description:
          "Update one TAPD requirement iteration after explicit approval.",
        parameters: {
          type: "object",
          required: [
            "projectId",
            "requirementId",
            "expectedIteration",
            "newIteration",
          ],
          properties: {
            projectId: { type: "string" },
            requirementId: { type: "string" },
            expectedIteration: { type: ["string", "null"] },
            newIteration: { type: "string" },
          },
        },
      },
      effect: "write",
      execute: (arguments_) =>
        client.updateRequirementIteration({
          projectId: requireString(arguments_, "projectId"),
          requirementId: requireString(arguments_, "requirementId"),
          expectedIteration: requireNullableString(
            arguments_,
            "expectedIteration",
          ),
          newIteration: requireString(arguments_, "newIteration"),
        }),
    },
  ];
}

function requireString(
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = arguments_[name];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${name} must be a non-empty string`);
  return value;
}

function requireNullableString(
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string | null {
  const value = arguments_[name];
  if (value !== null && typeof value !== "string")
    throw new Error(`${name} must be a string or null`);
  return value as string | null;
}
