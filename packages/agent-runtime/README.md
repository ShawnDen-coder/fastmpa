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
