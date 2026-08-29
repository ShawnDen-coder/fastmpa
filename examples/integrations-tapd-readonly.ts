import { createTapdReadonlyTools } from "integrations"

const [auditTool] = createTapdReadonlyTools({
  async listRequirements() {
    return {
      items: [
        { id: "REQ-001", title: "登录页优化", projectId: "7A", iteration: "Sprint 1" },
        { id: "REQ-002", title: "导出报表", projectId: "7A", iteration: null },
      ],
    }
  },
})

console.log(
  await auditTool.execute({ projectId: "7A", expectedIteration: "Sprint 1" }),
)
