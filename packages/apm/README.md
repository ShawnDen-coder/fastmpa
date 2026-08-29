# apm

FastMPA 的 APM 领域规则层。它只定义平台无关的 Requirement 事实和业务判断，
不依赖 TAPD、HTTP、Tool Pipeline 或 Runtime。

## 当前切片

`evaluateRequirementIteration()` 根据项目规则判断迭代字段是否缺失或不符合预期。
TAPD Adapter 负责把平台数据映射成 `RequirementSnapshot`，再由该包执行规则。

RequirementService 已提供 `confirm`、`start`、`requestReview`、`approveReview`、
证据和评论写入；状态变化必须携带 `expectedVersion`，并遵守负责人、证据和审核前置条件。
`MemoryRequirementRepository` 用于学习和单测，`SqliteRequirementRepository` 用于跨进程持久化；
两者都拒绝过期版本覆盖。

Repository 支持按 Workspace、状态、负责人和数量上限查询；
`evaluateRequirementRules()` 可对查询结果组合多条纯领域规则。

```text
TAPD fields → RequirementSnapshot → APM rule → violation → report / approval
Requirement → lifecycle action → versioned domain state
```

## Quickstart

规则本身不依赖平台；Requirement 持久化可以使用 SQLite `:memory:`：

```ts
const repository = new SqliteRequirementRepository(":memory:")
const service = new RequirementService(repository)
const requirement = service.create({
  id: "req-1",
  workspaceId: "demo",
  title: "导出报表",
  cardId: "card-1",
  now: new Date().toISOString(),
})
console.log(service.get("demo", requirement.id))
repository.close()
```

完整示例见 [`examples/apm-requirement.ts`](../../examples/apm-requirement.ts)：

```bash
pnpm --filter fastmpa-examples exec vite-node apm-requirement.ts
```

目录：

```text
src/
├── requirement/  # 模型、状态机、Repository 端口和领域服务
├── tools/        # 面向 Agent 的领域动作 Tool
└── index.ts      # 公共导出
tests/            # 规则、状态机、版本和 Tool 契约测试
```
