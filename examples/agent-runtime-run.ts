/**
 * agent-runtime example: 使用 SQLite :memory: RunStore 执行一次确定性的 Run。
 * 运行：pnpm --filter fastmpa-examples exec vite-node agent-runtime-run.ts
 * 外部服务：无，FakeModel 不访问网络。
 */
import { FakeModel, ToolRegistry } from "@shawnden-coder/agent-core"
import { AgentRuntime, SqliteRunStore } from "@shawnden-coder/agent-runtime"

const store = await SqliteRunStore.open({ filePath: ":memory:", migrationsFolder: false })
const runtime = new AgentRuntime(store)
const run = await runtime.startRun({
  runId: "run-1",
  model: new FakeModel([{ type: "text", content: "已完成只读检查" }]),
  tools: new ToolRegistry(),
  turn: { messages: [{ role: "user", content: "开始检查" }] },
  context: { agentId: "agent-tapd", workspaceId: "demo", trigger: "manual" },
})
console.log({ runId: run.runId, status: run.status, result: run.result })
store.close()
