/**
 * agent-scheduler example: 使用 SQLite :memory: Workspace 产生定时唤醒信号。
 * 运行：pnpm --filter fastmpa-examples exec vite-node agent-scheduler-wakeup.ts
 * 外部服务：无。
 */
import { AgentScheduler } from "agent-scheduler"
import { SqliteWorkspaceRepository } from "workspace"

const repository = new SqliteWorkspaceRepository(":memory:")
const scheduler = new AgentScheduler({
  repository,
  runtime: {
    async enqueue(input) {
      console.log("runtime enqueue", input)
      return input
    },
  },
  modelKey: "openrouter.default",
  toolsetKey: "tools.tapd.readonly",
  createId: () => "wake-1",
})
const signal = scheduler.notifySchedule({
  scheduleId: "schedule-1",
  workspaceId: "demo",
  agentId: "agent-tapd",
})
console.log("wake signal", signal)
repository.close()
