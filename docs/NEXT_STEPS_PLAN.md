# FastMPA 下一步学习与实施计划

## 当前基线

FastMPA 已完成 pnpm Monorepo、`agent-core` 的 Turn/Tool Loop，以及 `agent-runtime` 的生命周期、重试、取消、恢复和 Run/Event 持久化。当前重点不是增加更多界面或连接器，而是先让 Runtime 在异常退出、并发执行和事件订阅场景下保持一致。

实现方式继续遵循：先阅读 Cumora 的对应入口，画出数据流，再由你手动实现最小切片；每一步都用测试证明边界。

## 阶段一：Runtime 0.3 一致性收尾（已完成：6/6）

截至 2026-08-29，`finishedAt` 语义、生命周期结束/暂停事件、Run/Event 原子写入、最终结果/结构化错误持久化，以及稳定 cursor 分页已经完成。`agent-runtime` 类型检查与构建通过，12 个测试文件、73 个测试全部通过。

### 学习目标

- 区分终态 `completed/cancelled/failed` 与暂停态 `waiting/blocked`。
- 理解状态快照与事件流必须表达同一个事实。
- 理解数据库事务为何要覆盖“状态变化 + 生命周期事件”。

### 手动实现任务

- [x] 修正 `waiting/blocked` 的 `finishedAt` 语义。
- [x] 增加 `run_completed`、`run_waiting`、`run_blocked` 事件。
- [x] 将 `createWithEvent` 与 `transitionWithEvent` 设为 Store 端口：创建或状态变化必须与对应生命周期事件作为一个不可分割的写入完成。
- [x] 在 Run 中持久化 JSON-friendly 的最终 `result` 与结构化 `error`；不得保存原生 `Error`、模型实例或工具函数。
- [x] 增加 `listRuns({ status?, limit?, cursor? })`；固定按 `(createdAt, runId)` 排序，并把这对值编码为不透明 cursor，避免分页重复或遗漏。
- [x] 为 Memory、JSON 和 SQLite Store 复用同一组契约测试。

### 验收标准

- 每次生命周期状态变化都能在事件流中找到对应事件。
- 暂停态没有 `finishedAt`，恢复后时间字段仍然正确。
- 模拟创建、状态转换或事件写入失败时，不产生 Run/Event 不匹配的半完成状态。
- 三个 Store 都通过相同的原子创建、事件顺序与分页契约测试。
- `just build && just typecheck && just test` 全部通过。

## 阶段二：Runtime 0.4 崩溃恢复

补全 `claim → heartbeat/renew → release` 协议，并实现过期执行的恢复流程。`claimed` 不是新的 `RunStatus`：它是 `ownerId`、`leaseUntil` 和 `heartbeatAt` 组成的所有权记录，不能混入生命周期状态图。

```text
queued -- 原子 claim + start --> running (ownerId + leaseUntil)
                                  │ heartbeat / renew
                                  │
                                  ├─ 正常结束或暂停 → release lease
                                  │
                                  └─ lease 过期 / process lost
                                             ↓
                                      interrupted → queued → running
```

`queued → running` 必须在同一原子操作中校验 lease 并写入 `run_started`；不能先单独 claim、再由任意进程启动。`renew`、`release` 和所有 Run 更新都必须校验 owner，失去 lease 的 Worker 不得继续写入。

持久化 `modelKey`、`toolsetKey` 等执行描述，通过 Resolver 重建模型与工具，禁止把函数或实例写入数据库。恢复器只处理 lease 已过期的 `running/retrying` Run：先原子标记为 `interrupted` 并记录事件，再重新排队；`waiting/blocked` 必须等待显式 `resumeRun()`。

重点测试两个 Worker 原子争抢、错误 owner 续租/释放、lease 过期、心跳续租、崩溃后恢复，以及含成功工具副作用的 Run 不被整轮重放。后者需要幂等键或明确的人工恢复边界，不能仅依赖重新执行 Turn。

## 阶段三：第一个 APM 垂直切片

Runtime 达到上述验收标准后，再新增业务包：

```text
packages/
├── fastmpa-domain/   # Requirement、状态机、证据与版本规则
└── fastmpa-tools/    # inspect/update/comment/request-review
```

第一版只实现 `Requirement`，使用内存 Repository 完成：检查需求、更新状态、添加评论、请求审核。非法状态转换必须由领域代码拒绝，不能依赖模型自觉。

## 阶段四：Policy、Audit、Skills 与 MCP

按以下依赖顺序扩展：

```text
fastmpa-domain
      ↓
agent-policy → agent-audit
      ↓
agent-skills → mcp-adapter
```

- `agent-policy`：风险分级、权限、审批和幂等键。
- `agent-audit`：记录提议、批准、执行前后值和回执。
- `agent-skills`：发现、加载和渐进式注入业务指导，不直接执行操作。
- `mcp-adapter`：把 MCP Tool 转换为 Core Tool；所有写操作仍经过 Policy/Audit。

## 后续路线

完成上述核心闭环后，再依次推进领域持久化、Agenda/Scheduler、第一个平台 Connector、API/Web/Desktop、BYOA 和多角色 Agent。每个新包必须先有真实消费者、契约测试和清晰的失败恢复策略。
