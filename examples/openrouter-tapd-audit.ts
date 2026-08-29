/**
 * agent-core + integrations example: OpenRouter 驱动指定 TAPD Agent 完成只读审计。
 * 运行：pnpm --filter fastmpa-examples openrouter
 * 外部服务：OpenRouter；TAPD 使用本地 fixture，不执行写入。
 */
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import {
  createLogger,
  OpenRouterModel,
  runTurn,
} from "@shawnden-coder/agent-core"
import {
  createTapdReadonlyTools,
  type TapdReadonlyClient,
  type TapdRequirement,
} from "integrations"
import { toCoreToolRegistry } from "tool-pipeline"
import { SqliteWorkspaceRepository, sendMessage } from "workspace"

const apiKey = process.env.OPENROUTER_API_KEY
const modelName = process.env.OPENROUTER_MODEL

if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing")
if (!modelName) throw new Error("OPENROUTER_MODEL is missing")

const workspaceId = "demo-workspace"
const conversationId = "tapd-audit-demo"
const humanId = "user-demo"
const agentId = "agent-tapd"
const now = new Date().toISOString()
const userRequest =
  "帮我检查 TAPD 项目 7A 的所有需求单，确认迭代字段是否都是 Sprint 1。只做检查，不要修改任何数据。"

const fixtureUrl = new URL(
  "../apps/fastmpa/fixtures/tapd.json",
  import.meta.url,
)
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
  requirements: TapdRequirement[]
}

const client: TapdReadonlyClient = {
  async listRequirements({ projectId, page, pageSize }) {
    const matching = fixture.requirements.filter(
      (item) => item.projectId === projectId,
    )
    const start = (page - 1) * pageSize
    const items = matching.slice(start, start + pageSize)
    return {
      items,
      ...(start + pageSize < matching.length ? { nextPage: page + 1 } : {}),
    }
  },
}

const repository = new SqliteWorkspaceRepository(":memory:")
repository.saveParticipant({
  id: humanId,
  workspaceId,
  kind: "human",
  name: "Demo User",
  status: "active",
})
repository.saveParticipant({
  id: agentId,
  workspaceId,
  kind: "agent",
  name: "TAPD Agent",
  role: "TAPD requirement audit",
  status: "active",
  agent: {
    model: modelName,
    persona: "只读检查 TAPD 需求迭代字段，并清晰汇报异常。",
    toolNames: ["tapd.auditRequirementIterations"],
  },
})
repository.saveConversation({
  id: conversationId,
  workspaceId,
  title: "TAPD 迭代字段审计示例",
  participantIds: [humanId, agentId],
  createdAt: now,
})

const userMessage = sendMessage(repository, {
  id: randomUUID(),
  workspaceId,
  conversationId,
  senderId: humanId,
  body: userRequest,
  mentions: [agentId],
  createdAt: now,
}).message

const tools = toCoreToolRegistry(createTapdReadonlyTools(client))
const model = new OpenRouterModel({
  apiKey,
  model: modelName,
  appTitle: "FastMPA review example",
})
const log = createLogger(
  { agentId },
  {
    service: "fastmpa-example",
    logPath: process.env.FASTMPA_LOG_PATH ?? "logs/openrouter-tapd-audit.log",
  },
)
const result = await runTurn(
  {
    messages: [
      {
        role: "system",
        content:
          "你是被明确指定的 TAPD Agent。必须调用 tapd.auditRequirementIterations 完成检查，然后用中文总结异常需求。你只能检查，不能声称执行了修改。",
      },
      { role: "user", content: userMessage.body },
    ],
    maxSteps: 5,
  },
  { model, tools, logger: log },
)

const finalMessage = [...result.messages]
  .reverse()
  .find((message) => message.role === "assistant" && message.content)

if (finalMessage) {
  sendMessage(repository, {
    id: randomUUID(),
    workspaceId,
    conversationId,
    senderId: agentId,
    body: finalMessage.content,
    mentions: [],
    createdAt: new Date().toISOString(),
  })
}

console.log(
  JSON.stringify(
    {
      model: modelName,
      selectedAgent: agentId,
      registeredTools: ["tapd.auditRequirementIterations"],
      writesEnabled: false,
      turn: {
        status: result.status,
        steps: result.steps,
        events: result.events,
      },
      conversation: repository
        .listMessages(workspaceId, conversationId)
        .map(({ senderId, body }) => ({ senderId, body })),
      error: result.error?.message,
    },
    null,
    2,
  ),
)

if (result.status !== "done") process.exitCode = 1
repository.close()
