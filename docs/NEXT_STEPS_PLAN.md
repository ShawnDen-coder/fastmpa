# FastMPA 当前实施计划

## 当前基线

`agent-core` 已完成 Turn/Tool Loop；`agent-runtime` 已完成 Run/Event 持久化、生命周期、SQLite、Lease Worker、依赖重建和崩溃恢复。完整路线以 [项目 Roadmap](ROADMAP.md) 为准。

下一步停止继续扩张通用 Runtime，进入 **M2：Workspace 与 Attention 查询**。目标不是立即实现 TAPD/ShotGrid，也不是建立中央 Task Router，而是先让 Human 与 Agent 在同一个工作空间内围绕消息和卡片协作，并能统一加载该 Agent 的 Inbox 与 Agenda。

## 当前架构切片

```text
Human / Agent Participant
          │
          ▼
Conversation / Message ──┐
Board / Card ────────────┼→ loadAttention(agentId)
ReadCursor ──────────────┘       │
                                └→ AttentionSnapshot
```

## M2：Workspace 与 Attention 查询

### 学习目标

- 理解 Cumora 为什么统一建模 Human 与 Agent 为 `Participant`。
- 区分 Workspace 业务事实、轻量 WorkspaceChange 与持久 RuntimeEvent。
- 理解 Card/Message 是工作事实，Run 只是一次处理记录。
- 理解 Inbox 是 Message 基于 ReadCursor 形成的派生视图，而不是 Wake 队列。
- 理解 Agenda 是 Card、Calendar 和后续 APM 工作的派生视图，而不是任务表。
- 理解 Wake 可以丢失或合并，但未读消息必须能从 Inbox 重新查询。
- 理解业务写入可以返回轻量 WorkspaceChange，无需提前建设持久事件流。
- 建立 `workspaceId` 隔离，避免后续 Connector 和 Agent 跨空间读取数据。

### 建议目录

```text
packages/workspace/
├── src/
│   ├── participant/
│   ├── conversation/
│   ├── board/
│   ├── attention/
│   ├── repository/
│   └── index.ts
├── tests/
└── README.md
```

第一版使用内存 Repository。Inbox 与 Agenda 只作为 `attention/` 中的查询结果，不创建独立 Repository。不要在本阶段加入 PostgreSQL、Redis、统一事件存储、HTTP API、APM 状态机或外部平台 SDK。

### 手动实现顺序

1. 定义 `Participant`：`id`、`workspaceId`、`kind: human | agent`、`name`、`role`、`status`；Agent 配置先只保留最小 Persona/Model/Tools 引用。
2. 定义 Conversation、Message，以及发送消息用例；消息支持 `mentions` 和稳定的会话内顺序。
3. 定义按 `(agentId, conversationId)` 存储的 `ReadCursor`，实现 `loadInbox(agentId)`：聚合该 Agent 在所有可见 Conversation 中各自读取边界之后的消息。
4. 实现显式推进读取边界的用例；禁止在生成 Wake 或开始 Turn 时自动标记已读。
5. 定义 Board、Column、Card，以及创建、指派、移动卡片用例；Card 支持 `assigneeId`。
6. 实现 `loadAgenda(agentId)`，第一版只汇总指派给该 Agent 的 Card。
7. 用 `loadAttention(agentId)` 组合 Inbox 与 Agenda，返回只读 `AttentionSnapshot`。
8. 让消息发送和 Card 指派用例返回轻量 `WorkspaceChange`，供后续 Scheduler 调用 `notify()`；不持久化通用事件。
9. 为 Repository 编写共享契约测试，验证 workspace 隔离、快照复制、版本冲突和稳定查询顺序。
10. 写两个垂直测试：Human @Agent 后 AttentionSnapshot 包含该消息；Human 指派 Card 后 Agenda 包含该卡片。

### 验收标准

- Human 和 Agent 使用同一 Participant 模型，同时保留 `kind` 差异。
- 不同 `workspaceId` 的对象不能互相引用或查询。
- Message mention 和 Card assignment 引用的成员必须存在于同一 Workspace。
- Inbox 只返回 Agent 可见且位于读取边界之后的消息，并保持稳定顺序。
- Agenda 只返回与 Agent 相关的工作，不复制或保存 Card。
- WakeSignal 未发送或重复发送都不改变 Inbox；只有显式确认处理后才能推进读取边界。
- 业务写入返回的 WorkspaceChange 只描述“谁可能需要关注什么”，不是事实来源。
- `pnpm --filter workspace typecheck/test/build` 和仓库 `just ci` 通过。

## M3 预告：Agent Scheduler

M2 验收后只创建 `agent-scheduler`。第一个闭环处理 Message @Agent 和 Card 指派。Scheduler 内部融合 Notify、WakeSignal、Inbox/Agenda Triage、重复提醒合并、AgentContext 组装与 Runtime Dispatch：

```ts
interface WakeSignal {
  wakeId: string
  workspaceId: string
  agentId: string
  reason: "mention" | "assignment"
  sourceRef: { type: "message" | "card"; id: string }
}
```

```text
notify → loadAttention → triage → enqueueRun
```

Turn 成功处理消息后才推进 ReadCursor，失败则保留 Inbox。到这一步再为 `AgentRun` 增加必要的 Agent、Workspace 和来源关联字段。

## 暂缓事项

- `apm` / Requirement 状态机。
- Tool Pipeline 中的 Policy、Audit、Approval 和 Tool Call Journal。
- Skills、MCP、TAPD、ShotGrid。
- Redis、远程 Pod、BYOA、多 Agent 自动路由和 UI。

这些能力没有取消，只是按照 Cumora 的依赖关系后移。Requirement 阶段见 [APM Requirement 垂直切片](FASTMPA_DOMAIN_PLAN.md)。
