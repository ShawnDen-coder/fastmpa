# FastMPA

The final FastMPA program lives here. This private app composes the reusable
libraries under `packages/` and is the future home for Runtime, Skills, and
MCP integration wiring.

## Quickstart

先构建 App，再运行本地 fixture 审计；该流程不访问真实 TAPD：

```bash
just build
node apps/fastmpa/dist/index.js tapd-audit \
  --file ./apps/fastmpa/fixtures/tapd.json --project 7A --iteration "Sprint 1"
```

需要观察完整的 OpenRouter Agent 闭环时，运行仓库级示例：

```bash
pnpm --filter fastmpa-examples openrouter
```

组合层负责装配 Workspace、Scheduler、Runtime、Tool Pipeline 和 Integrations；
具体包的最小用法见 [`examples/README.md`](../../examples/README.md)。

## Commands

```bash
pnpm --filter fastmpa build
pnpm --filter fastmpa test
node apps/fastmpa/dist/index.js hello -n FastMPA
```

本地 TAPD 审计 Demo（fixture 不包含真实凭据）：

```bash
node apps/fastmpa/dist/index.js tapd-audit \
  --file ./fixtures/tapd.json --project 7A --iteration "Sprint 1"
```

真实 TAPD API（`--iteration` 为 iteration ID）：

```bash
set TAPD_API_USER=your-user
set TAPD_API_PASSWORD=your-password
node apps/fastmpa/dist/index.js tapd-audit --project 7A --iteration 12345
```

审计只读查询会生成报告；任何写回都必须通过 Tool Pipeline 审批，并进行旧值校验。

Host 装配由 `createFastMpaHost()` 提供；未传 `repository` 时，它会在 `databasePath` 中默认创建持久化 Workspace，显式传入 Repository 则适合测试或嵌入式场景。使用 `MapRuntimeDependencyResolver` 把持久化的 `modelKey/toolsetKey` 解析为当前 Worker 的 Model 和 Core ToolRegistry。TAPD 默认 Toolset 通过 `createTapdReadonlyToolset()` 创建，只向 Core 暴露只读审计 Tool。需要写入时使用 `createPersistentTapdToolset()`，它把 Pipeline ApprovalStore 放入与 Runtime 相同的 SQLite 文件；也可以把返回的 `approvalStore` 注入 `createFastMpaHost()` 共享生命周期。用户批准后再通过 `ApprovalResumer.approveAndResume(runId, approvalId)` 承接 waiting Run。

APM Requirement 通过 `createWorkspaceReferencePort()` 校验 Card/Conversation 所属 Workspace，
再由 `createRequirementTools()` 暴露给 Agent；状态更新必须经过 Pipeline 审批和领域服务。
状态变化可通过 `createRequirementConversationReporter()` 写回 Conversation，保留动作、状态和版本；
完整 Card→Scheduler→Approval→Requirement→Conversation 链路已有集成测试。

The generated executable entry point is `dist/index.js`. The app itself is
private; publishable functionality belongs in `packages/`.
