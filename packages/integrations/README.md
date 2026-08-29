# integrations

FastMPA 的外部平台适配层。目前实现 TAPD 只读检查，后续扩展 ShotGrid、MCP 等平台。

## 当前闭环

```text
Tool Pipeline
  → TAPD listRequirements（只读分页）
  → 迭代字段规则检查
  → buildIterationAuditMessage → Workspace Conversation
  → Conversation / 用户审批
```

本包不负责 Agent 调度、审批和 Runtime 生命周期；平台写入必须继续经过 `tool-pipeline`。

## 目录结构

```text
src/
├── tapd/        # TAPD Client 端口、模型、只读检查和 Tool 工厂
└── index.ts     # 公共导出
tests/           # 分页、规则判断和 Tool 测试
```

## 技术栈与命令

- TypeScript 5.9，ESM，严格模式
- `@shawnden-coder/agent-core`：ToolCall/ToolDefinition 契约
- `apm`：执行平台无关的 Requirement 规则
- `tool-pipeline`：注册并保护外部 Tool
- `pnpm test`、`pnpm typecheck`、`pnpm build`

`TapdHttpClient` 使用 TAPD 官方 REST API，支持分页查询和带旧值校验的写入；接口仍可注入替身，便于手动学习和测试。真实接入时配置 `TAPD_API_USER`、`TAPD_API_PASSWORD`，CLI 的 `--project` 使用 TAPD workspace ID，`--iteration` 使用 TAPD iteration ID。`TapdApiError` 会保留 HTTP 状态和平台信息；读取的限流/服务端错误可重试，但写入传输失败始终不可安全自动重放。写入仍须经过 `tool-pipeline` 审批，成功返回的 `receiptId` 由 App 层写回 Conversation。

写入传输结果未知时调用 `verifyTapdUpdate()` 进行只读核查：结果分为 `applied`、`not_applied` 和 `conflict`；只有人工确认后才能重新提交写入。

## Quickstart

先注入一个符合 `TapdReadonlyClient` 的 Client，再创建只读 Tool；真实 TAPD 接入只需要替换 Client：

```ts
const [tool] = createTapdReadonlyTools(client)
const report = await tool.execute({
  projectId: "7A",
  expectedIteration: "Sprint 1",
})
console.log(report)
```

离线示例见 [`examples/integrations-tapd-readonly.ts`](../../examples/integrations-tapd-readonly.ts)：

```bash
pnpm --filter fastmpa-examples exec vite-node integrations-tapd-readonly.ts
```
