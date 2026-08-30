# workspace

FastMPA 的协作工作空间基础包，负责保存 Human 与 Agent 共同工作的业务事实，并提供统一的 Attention 查询。

## 实现目标

本包是 V1 的协作事实层，保留 Cumora 的 Workspace、Inbox 与 Agenda 抽象：

- 用统一的 `Participant` 表示 Human 和 Agent，并通过 `kind` 区分身份。
- 保存 `Conversation/Message`、`Board/Column/Card` 和 Agent 的 `ReadCursor`。
- 通过 `loadInbox`、`loadAgenda`、`loadAttention` 提供派生查询。
- 提供 `InMemoryWorkspaceRepository` 与 `SqliteWorkspaceRepository`；生产 Host 可在进程重启后恢复 Workspace 事实。
- 持有周期 `Schedule` 定义；Application Orchestrator 读取它并通过 Runtime 入队。删除会真正移除持久化 Schedule。
- 业务写入返回轻量 `WorkspaceChange`，由 Runtime Scheduler 触发通知。

Inbox 与 Agenda 是查询结果，不是独立队列或 Repository；本包不负责 Runtime、Scheduler、HTTP API 或领域状态机。

## 学习与实施计划

1. 先定义领域类型与 Workspace 隔离规则。
2. 使用内存 Repository 完成领域行为，再用 SQLite Repository 验证跨进程持久化。
3. 按 `(agentId, conversationId)` 实现 ReadCursor 与显式确认读取。
4. 组合 Inbox 与 Agenda 为只读 `AttentionSnapshot`。
5. 编写 Repository 契约测试和垂直闭环测试：`@Agent` 消息、Agent 卡片指派、跨实例恢复。

## 目录结构

```text
src/
├── participant.ts          # Human / Agent 成员
├── conversation.ts         # Conversation、Message、ReadCursor
├── board.ts                # Board、Column、Card
├── attention.ts            # Inbox、Agenda、AttentionSnapshot 查询
├── schedule.ts             # 周期 Schedule 定义
├── repository.ts           # Repository 契约与内存实现
├── sqlite-repository.ts    # SQLite 实现
├── testing.ts              # 测试专用内存出口
└── index.ts                # 公共导出
tests/             # 单元测试与垂直闭环测试
```

## 技术栈与命令

- TypeScript 5.9，ESM，严格模式
- Vitest：`pnpm test`
- TypeScript：`pnpm typecheck`
- Biome：`pnpm check`、`pnpm format`
- 构建：`pnpm build`

实现时优先保持纯领域逻辑、显式依赖注入和稳定查询顺序；不要把 Runtime、Scheduler 或外部平台适配逻辑放入本包。

## Quickstart

使用 SQLite `:memory:` 创建 Workspace，并通过 `sendMessage` 生成可供 Scheduler 消费的 `WorkspaceChange`：

```ts
const repository = new SqliteWorkspaceRepository(":memory:")
// 先保存 Participant 和 Conversation，再调用 sendMessage。
const { message, change } = sendMessage(repository, input)
console.log(message, change)
repository.close()
```

完整示例见 [`examples/workspace-conversation.ts`](../../examples/workspace-conversation.ts)：

```bash
pnpm --filter fastmpa-examples exec vite-node workspace-conversation.ts
```
