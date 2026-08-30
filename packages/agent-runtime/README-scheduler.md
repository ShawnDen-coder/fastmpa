# Runtime Scheduler

FastMPA 的 Agent 调度边界，参考 Cumora 的唤醒、Inbox/Agenda triage 和 Runtime dispatch 逻辑。

## 当前闭环

```text
WorkspaceChange / Schedule → notify → dedupe → WorkClaim → loadAttention → triage → enqueueRun
```

Scheduler 只负责协调，不拥有 Conversation、Card 或 Run 的事实来源。唤醒信号可以重复或丢失；下次通知仍通过 Workspace 的 Attention 查询恢复未处理工作。

WorkClaim 按 Workspace、Agent 和来源对象建立短期租约，防止并发 Dispatch 重复处理同一工作。默认实现是进程内 `InMemoryWorkClaimStore`；多进程部署可使用 `SqliteWorkClaimStore.open({ filePath })`，它通过 SQLite 原子 UPSERT 实现抢占和过期接管。

## 目录结构

```text
src/
├── scheduler.ts  # notify、去重、Attention 查询和 Runtime dispatch
├── schedule.ts   # 周期 Schedule 到期扫描、派发和 schedule WakeSignal
├── claim.ts      # WorkClaim/Lease 接口与内存实现
├── sqlite-claim.ts # SQLite 原子 ClaimStore
├── context.ts    # Persona、Wake、Inbox、Agenda → Core Turn 上下文
├── triage.ts     # 判断 Agent 是否值得启动一次 Turn
└── index.ts      # 公共导出
tests/            # 调度与去重测试
```

## 技术栈与命令

- TypeScript 5.9，ESM，严格模式
- `workspace`：提供事实与 Attention 查询
- `@shawnden-coder/agent-runtime`：提供 Run 入队接口
- `pnpm test`、`pnpm typecheck`、`pnpm build`

`AgentContext` 当前由 Persona、工具名、Attention 和 Wake 来源组成。`ScheduleRunner` 只负责周期扫描和唤醒，不包含 TAPD/ShotGrid 业务规则；Schedule 定义由 Workspace Repository 持有。多进程部署可把 ClaimStore 替换为 SQLite 实现。

传入 `dispatch: signal => scheduler.dispatch(signal)` 后调用 `start()` 即可自动派发到 Runtime；不传时可使用 `tick()` 手动观察每次到期信号。

## Quickstart

Scheduler 只产生唤醒信号，Runtime 由调用方注入：

```ts
const scheduler = new AgentScheduler({
  repository,
  runtime: { enqueue: async (input) => input },
  modelKey: "model.default",
  toolsetKey: "tools.readonly",
})
const signal = scheduler.notifySchedule({
  scheduleId: "schedule-1",
  workspaceId: "demo",
  agentId: "agent-1",
})
```

应用层通过 `FastMpaApplication` 的 `schedule.create` 命令创建并持久化计划。
