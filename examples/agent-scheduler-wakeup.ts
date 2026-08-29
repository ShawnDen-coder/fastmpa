import { AgentScheduler } from "agent-scheduler"
import { InMemoryWorkspaceRepository } from "workspace"

const scheduler = new AgentScheduler({
  repository: new InMemoryWorkspaceRepository(),
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
