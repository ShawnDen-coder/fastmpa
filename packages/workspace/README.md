# workspace

FastMPA 的协作工作空间基础包，负责保存 Human 与 Agent 共同工作的业务事实，并提供统一的 Attention 查询。

## 实现目标

本包对应 M2 阶段，参考 Cumora 的 Workspace、Inbox 与 Agenda 抽象：

- 用统一的 `Participant` 表示 Human 和 Agent，并通过 `kind` 区分身份。
- 保存 `Conversation/Message`、`Board/Column/Card` 和 Agent 的 `ReadCursor`。
- 通过 `loadInbox`、`loadAgenda`、`loadAttention` 提供派生查询。
- 提供 `InMemoryWorkspaceRepository` 与 `SqliteWorkspaceRepository`；生产 Host 可在进程重启后恢复 Workspace 事实。
- 持有周期 `Schedule` 定义，由 Scheduler 读取并推进下一次执行时间。
- 业务写入返回轻量 `WorkspaceChange`，供后续 `agent-scheduler` 触发通知。

Inbox 与 Agenda 是查询结果，不是独立队列或 Repository；本包不负责 Runtime、Scheduler、HTTP API 或 APM 状态机。

## 学习与实施计划

1. 先定义领域类型与 Workspace 隔离规则。
2. 使用内存 Repository 完成领域行为，再用 SQLite Repository 验证跨进程持久化。
3. 按 `(agentId, conversationId)` 实现 ReadCursor 与显式确认读取。
4. 组合 Inbox 与 Agenda 为只读 `AttentionSnapshot`。
5. 编写 Repository 契约测试和垂直闭环测试：`@Agent` 消息、Agent 卡片指派、跨实例恢复。

## 目录结构

```text
src/
├── participant/   # Human / Agent 成员
├── conversation/  # Conversation、Message、ReadCursor
├── board/         # Board、Column、Card
├── attention/     # Inbox、Agenda、AttentionSnapshot 查询
├── schedule/      # 周期 Schedule 定义
├── repository/    # Repository 契约、内存实现、SQLite 实现
└── index.ts       # 公共导出
tests/             # 单元测试与垂直闭环测试
```

## 技术栈与命令

- TypeScript 5.9，ESM，严格模式
- Vitest：`pnpm test`
- TypeScript：`pnpm typecheck`
- Biome：`pnpm check`、`pnpm format`
- 构建：`pnpm build`

实现时优先保持纯领域逻辑、显式依赖注入和稳定查询顺序；不要把 Runtime、Scheduler 或外部平台适配逻辑放入本包。
