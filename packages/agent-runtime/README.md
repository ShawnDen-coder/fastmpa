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
