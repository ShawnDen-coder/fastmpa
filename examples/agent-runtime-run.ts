import { FakeModel, ToolRegistry } from "@shawnden-coder/agent-core"
import { AgentRuntime, MemoryRunStore } from "@shawnden-coder/agent-runtime"

const runtime = new AgentRuntime(new MemoryRunStore())
const run = await runtime.startRun({
  runId: "run-1",
  model: new FakeModel([{ type: "text", content: "已完成只读检查" }]),
  tools: new ToolRegistry(),
  turn: { messages: [{ role: "user", content: "开始检查" }] },
  context: { agentId: "agent-tapd", workspaceId: "demo", trigger: "manual" },
})
console.log({ runId: run.runId, status: run.status, result: run.result })
