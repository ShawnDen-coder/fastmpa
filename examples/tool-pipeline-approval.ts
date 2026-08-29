/**
 * tool-pipeline example: 使用 SQLite :memory: 保存审批、结果和审计记录。
 * 运行：pnpm --filter fastmpa-examples exec vite-node tool-pipeline-approval.ts
 * 外部服务：无。
 */
import { SqliteApprovalStore, ToolPipeline, ToolRegistry } from "tool-pipeline"

const registry = new ToolRegistry()
registry.register({
  definition: {
    name: "tapd.updateIteration",
    description: "更新需求迭代",
    parameters: { type: "object", required: ["requirementId", "iteration"] },
  },
  effect: "write",
  execute: (args) => ({ updated: true, ...args }),
})
const approvalStore = new SqliteApprovalStore(":memory:")
const pipeline = new ToolPipeline(registry, undefined, () => "approval-1", approvalStore)
const pending = await pipeline.execute(
  {
    id: "call-1",
    name: "tapd.updateIteration",
    arguments: JSON.stringify({ requirementId: "REQ-002", iteration: "Sprint 1" }),
  },
  { actorId: "agent-tapd", idempotencyKey: "demo-update-1" },
)
console.log("first decision", pending)
if (pending.status === "approval_required")
  console.log("after approval", await pipeline.approve(pending.approval.approvalId))
approvalStore.close()
