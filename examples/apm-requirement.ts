/**
 * apm example: 使用 SQLite :memory: 保存 Requirement，并执行平台无关规则。
 * 运行：pnpm --filter fastmpa-examples exec vite-node apm-requirement.ts
 * 外部服务：无。
 */
import {
  evaluateRequirementIteration,
  RequirementService,
  SqliteRequirementRepository,
} from "apm"

const repository = new SqliteRequirementRepository(":memory:")
const service = new RequirementService(repository)
const stored = service.create({
  id: "req-1",
  workspaceId: "demo",
  title: "导出报表",
  cardId: "card-1",
  now: new Date().toISOString(),
})
console.log("stored requirement", service.get("demo", stored.id))

console.log(
  evaluateRequirementIteration(
    {
      id: "REQ-002",
      title: "导出报表",
      projectId: "7A",
      iterationId: null,
    },
    { projectId: "7A", expectedIterationId: "Sprint 1" },
  ),
)
repository.close()
