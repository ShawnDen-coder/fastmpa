# Runtime Tooling

FastMPA 的统一 Tool 调用边界。所有 TAPD、ShotGrid、MCP 等外部动作必须经过本包的校验、策略、审批、幂等和审计流程。

## 当前闭环

```text
ToolCall → ToolCatalog → 参数校验 → Policy
                         ├── deny
                         ├── require approval → approve → execute
                         └── allow → execute
                                   → idempotency → audit journal
```

本包不包含平台 SDK 或领域业务规则；外部执行器必须通过 `RuntimeTooling` 的 `ToolCatalog` 注入。审批、成功结果和 Journal 可使用 `InMemoryApprovalStore`，也可使用 `SqliteApprovalStore` 在进程重启后恢复；结果缓存会按幂等键阻止同一写入被重复执行。所有投影到 Core 的写入 Tool 都经过 Policy、Approval、Idempotency 和 Journal。

## 目录结构

```text
src/
├── pipeline.ts  # 统一执行入口、审批与幂等
├── approval-store.ts # 审批状态的内存/SQLite 存储
├── policy.ts    # Tool 权限决策
├── registry.ts  # Tool 定义与执行器注册
└── index.ts     # 公共导出
tests/           # 只读、拒绝、审批、幂等和失败测试
```

## 技术栈与命令

- TypeScript 5.9，ESM，严格模式
- `@shawnden-coder/agent-core`：复用 ToolCall / ToolDefinition / ToolResult 契约
- `pnpm test`、`pnpm typecheck`、`pnpm build`

默认原则：只读 Tool 可直接执行；写入 Tool 默认需要审批；拒绝和执行结果都必须形成可查询的 Journal 记录。

## Quickstart

写入 Tool 使用 SQLite `:memory:` 保存审批和 Journal：

```ts
const store = new SqliteApprovalStore(":memory:")
const pipeline = new ToolPipeline(registry, undefined, undefined, store)
const decision = await pipeline.execute(call, {
  actorId: "agent-1",
  idempotencyKey: "run-1:update-1",
  runId: "run-1",
})
if (decision.status === "approval_required")
  await pipeline.approve(decision.approval.approvalId, "run-1")
store.close()
```

应用层通过 `FastMpaApplication` 的批准/拒绝命令驱动审批恢复。
