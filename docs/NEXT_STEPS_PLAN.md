# FastMPA 当前实施计划

## 当前基线

`agent-core` 已完成 Turn/Tool Loop；`agent-runtime` 已完成 Run/Event 持久化、生命周期、SQLite、Lease Worker、依赖重建和崩溃恢复。完整路线以 [项目 Roadmap](ROADMAP.md) 为准。

下一步停止继续扩张通用 Runtime，进入 **M2：最小 Workspace 与 Inbox**。目标不是立即实现 TAPD/ShotGrid，也不是建立中央 Task Router，而是先让 Human 与 Agent 在同一个工作空间内围绕消息和卡片协作，并保证 Wake 丢失后未处理消息仍可恢复。

## 当前架构切片

```text
Human / Agent Participant
          │
          ▼
Conversation / Message ──┐
Board / Card ────────────┼→ WorkspaceEvent
Agent Read Cursor ────────┘
          │
          └→ Inbox Projection → 后续 Wake / Triage / Scheduler
```

## M2：最小 Workspace 与 Inbox

### 学习目标

- 理解 Cumora 为什么统一建模 Human 与 Agent 为 `Participant`。
- 区分 Workspace 业务事件与 RuntimeEvent。
- 理解 Card/Message 是工作事实，Run 只是一次处理记录。
- 理解 Inbox 是 Message 基于 Agent Read Cursor 形成的持久投影，而不是 Wake 队列。
- 理解 Wake 可以丢失或合并，但未读消息必须能从 Inbox 重新查询。
- 建立 `workspaceId` 隔离，避免后续 Connector 和 Agent 跨空间读取数据。

### 建议目录

```text
packages/workspace/
├── src/
│   ├── participant/
│   ├── conversation/
│   ├── inbox/
│   ├── board/
│   ├── events/
│   ├── repository/
│   └── index.ts
├── tests/
└── README.md
```

第一版使用内存 Repository。不要在本阶段加入 PostgreSQL、Redis、HTTP API、APM 状态机或外部平台 SDK。

### 手动实现顺序

1. 定义 `Participant`：`id`、`workspaceId`、`kind: human | agent`、`name`、`role`、`status`；Agent 配置先只保留最小 Persona/Model/Tools 引用。
2. 定义 Conversation、Message，以及发送消息用例；消息支持 `mentions` 和稳定的会话内顺序。
3. 定义按 `(agentId, conversationId)` 存储的 `ReadCursor`，实现 `loadInbox(agentId)`：聚合该 Agent 在所有可见 Conversation 中各自读取边界之后的消息。
4. 实现显式推进读取边界的用例；禁止在生成 Wake 或开始 Turn 时自动标记已读。
5. 定义 Board、Column、Card，以及创建、指派、移动卡片用例；Card 支持 `assigneeId`。
6. 定义独立于 RuntimeEvent 的 `WorkspaceEvent`，记录消息发送、读取边界推进、卡片创建、指派和移动。
7. 为 Repository 编写共享契约测试，验证 workspace 隔离、快照复制、版本冲突和事件顺序。
8. 写两个垂直测试：Human @Agent 后 Inbox 可见该消息；Human 创建 Card 并指派给 Agent 后产生目标明确的 WorkspaceEvent。

### 验收标准

- Human 和 Agent 使用同一 Participant 模型，同时保留 `kind` 差异。
- 不同 `workspaceId` 的对象不能互相引用或查询。
- Message mention 和 Card assignment 引用的成员必须存在于同一 Workspace。
- Inbox 只返回 Agent 可见且位于读取边界之后的消息，并保持稳定顺序。
- WakeSignal 未发送或重复发送都不改变 Inbox；只有显式确认处理后才能推进读取边界。
- 业务变更与对应 WorkspaceEvent 原子写入，失败时不产生半完成状态。
- `pnpm --filter workspace typecheck/test/build` 和仓库 `just ci` 通过。

## M3 预告：Wake、Inbox/Agenda Triage 与 Scheduler

M2 验收后再创建 `agents` 与 `scheduler`。第一个闭环只处理两种触发：Message @Agent 和 Card 指派。Inbox 负责消息可靠性，Agenda 负责卡片和主动工作，`WakeSignal` 只负责低延迟提醒。它至少携带：

```ts
interface WakeSignal {
  wakeId: string
  workspaceId: string
  agentId: string
  reason: "mention" | "assignment"
  sourceRef: { type: "message" | "card"; id: string }
}
```

Inbox Triage 判断未读消息是否需要响应；Agenda 根据 `agentId` 汇总 Card 和后续到期事项；Agenda Triage 判断是否值得主动行动；Scheduler 去重并调用现有 `agent-runtime`。Turn 成功处理消息后才推进 Read Cursor，失败则保留 Inbox。到这一步才为 `AgentRun` 增加必要的 Agent、Workspace 和 Wake 关联字段。

## 暂缓事项

- `fastmpa-domain` / Requirement 状态机。
- Policy、Audit、Approval 和 Tool Call Journal。
- Skills、MCP、TAPD、ShotGrid。
- Redis、远程 Pod、BYOA、多 Agent 自动路由和 UI。

这些能力没有取消，只是按照 Cumora 的依赖关系后移。Requirement 阶段见 [APM Requirement 垂直切片](FASTMPA_DOMAIN_PLAN.md)。
