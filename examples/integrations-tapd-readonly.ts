/**
 * integrations example: 用内存 Client 模拟 TAPD，只展示只读 Adapter/Tool。
 * 运行：pnpm --filter fastmpa-examples exec vite-node integrations-tapd-readonly.ts
 * 外部服务：无，不调用真实 TAPD。
 */
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
