# agent-runtime

Runtime 是 FastMPA 的唯一执行基础包：持久化 Run、队列、SQLite Lease、恢复、重试，以及 Tool Catalog、策略、审批、幂等和审计均在此边界内。生产使用 SQLite；Memory/JSON Store 通过 `@shawnden-coder/agent-runtime/testing` 提供。

FastMPA 的持久化 Agent 执行层：保存 Run/Event，使用唯一公共 `AgentRuntime` facade 入队、取消、恢复、重试、查询并管理 Worker。

## 运行方式

```ts
const runtime = new AgentRuntime(store, {
  resolver,
  ownerId: "worker-1",
});
runtime.startWorkers();
```

`ScheduleRunner` 只产生稳定 occurrence 并调用 `AgentRuntime.enqueue()`；Lease Worker 和消费循环是 facade 内部组件。Worker 必须使用持久化 `RunLeaseStore` 才能支持多进程领取、续租和崩溃恢复。

## Quickstart

使用 SQLite `:memory:` Store 执行一个不访问网络的 Run：

```ts
const store = await SqliteRunStore.open({
  filePath: ":memory:",
  migrationsFolder: false,
})
const runtime = new AgentRuntime(store)
const run = await runtime.startRun({ runId, model, tools, turn })
store.close()
```

可运行示例见 [`examples/agent-runtime-run.ts`](../../examples/agent-runtime-run.ts)：

```bash
pnpm --filter fastmpa-examples exec vite-node agent-runtime-run.ts
```

## Scheduler boundary

Scheduler 只负责协调唤醒、去重、Attention 查询和 Runtime dispatch，不拥有
Conversation、Card 或 Run 的事实来源：

```text
WorkspaceChange / Schedule → notify → dedupe → loadAttention → triage → enqueueRun
```

重复 Dispatch 由稳定 occurrence/message Run ID 和 Runtime 的 SQLite 入队幂等性处理；
Lease 只存在于 Runtime 执行层。`ScheduleRunner` 只负责周期扫描和唤醒，
`AgentContext` 由 Persona、工具名、Attention 和 Wake 来源组成。

## Tooling boundary

所有 TAPD、ShotGrid、MCP 等外部动作必须经过 Tool Catalog、参数校验、Policy、审批、
幂等和审计流程。只读 Tool 可直接执行；写入 Tool 默认需要审批。外部执行器通过
`RuntimeTooling` 注入，本包不包含平台 SDK 或领域业务规则。
