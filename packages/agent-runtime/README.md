# agent-runtime

FastMPA 的持久化 Agent 执行层：保存 Run/Event，使用 `LeaseRuntimeWorker` 领取并执行 Run，并通过 `RuntimeWorkerLoop` 持续消费队列和恢复过期 Run。

## 运行方式

```ts
const loop = new RuntimeWorkerLoop({
  store,
  worker: new LeaseRuntimeWorker(store, workerOptions),
  pollIntervalMs: 1_000,
});
loop.start();
```

`ScheduleRunner` 负责产生 queued Run，`RuntimeWorkerLoop` 负责消费；两者不共享业务规则。Worker 必须使用持久化 `RunLeaseStore` 才能支持多进程领取、续租和崩溃恢复。

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
