# FastMPA 当前实施计划

## 当前基线

`agent-core` 已完成 Turn/Tool Loop；`agent-runtime` 已完成 Run/Event 持久化、生命周期、SQLite、Lease Worker、依赖重建和崩溃恢复。完整路线以 [项目 Roadmap](ROADMAP.md) 为准。

当前基础设施已覆盖 Core、Runtime、Workspace、Scheduler、Tool Pipeline 和 TAPD Adapter；Workspace 已补齐 SQLite 持久化，并由 FastMPA Host 默认装配。M7 的本地 North Star 闭环已完成，包含持久审批、回执、结果未知核查和分页安全校验；下一步是接入真实凭据与完整规则，再扩展周期 Schedule 的真实执行验证。

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

Workspace 同时提供内存与 SQLite Repository；Inbox 与 Agenda 只作为 `attention/` 中的查询结果，不创建独立队列。不要在本阶段加入 PostgreSQL、Redis、统一事件存储、HTTP API、APM 状态机或外部平台 SDK。

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

## M3：Agent Scheduler（已开始实施）

已通过 `just add-lib agent-scheduler` 创建 `packages/agent-scheduler`，并完成第一版 `notify → loadAttention → triage → enqueueRun`。当前实现已加入 AgentContext、重复 Wake 合并、WorkClaim/Lease、Runtime 执行、成功后的 ReadCursor 推进、周期 `schedule` Wake，以及 SQLite ClaimStore 和 `RuntimeWorkerLoop`。多 Worker 运行入口已由 FastMPA Host 组合，后续只需在 E2E 中验证健康检查、优雅退出和真实调度。

Scheduler 内部融合 Notify、WakeSignal、Inbox/Agenda Triage、重复提醒合并、AgentContext 组装与 Runtime Dispatch：

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

Turn 成功处理消息后才推进 ReadCursor，失败则保留 Inbox。`AgentRun.context` 现在保存 Agent、Workspace、trigger 和 sourceRef，便于恢复、追踪和后续审计。

## 后续暂缓事项

- `apm` / Requirement 状态机。
- Skills、MCP、ShotGrid 的完整适配。
- Redis、远程 Pod、BYOA、多 Agent 自动路由和 UI。

## M6 前置实现：Tool Pipeline（已实现第一版）

已通过 `just add-lib tool-pipeline` 创建 `packages/tool-pipeline`，完成统一 Tool Registry、只读直接执行、写入审批、参数校验、幂等结果缓存和 Journal。Approval 现在支持内存与 SQLite 持久化，进程重启后可由当前 Registry 恢复原 ToolCall；Core 能把 `approval_required` 转成 `waiting`，Runtime 会持久化 approvalId；`ApprovalResumer` 校验 Run 归属后批准并恢复同一个 Run。FastMPA Host 已提供 Model/Tool Resolver、TAPD 只读 Toolset、持久 RunStore/Worker 和可共享的 ApprovalStore；`createPersistentTapdToolset()` 提供标准持久读写装配。TAPD Agent 已通过 Core/Runtime/审批 E2E 以及 Scheduler 消息和周期 Schedule E2E；下一步接入真实凭据、平台回执、完整规则和失败恢复。

这些能力没有取消，只是按照 Cumora 的依赖关系后移。Requirement 阶段见 [APM Requirement 垂直切片](FASTMPA_DOMAIN_PLAN.md)。

## TAPD 垂直切片（进行中）

`packages/integrations` 提供 `tapd.auditRequirementIterations` 只读 Tool 和独立的写入 Tool；`TapdHttpClient` 已接入 TAPD 官方 REST API，支持 Basic Auth、全分页读取、写入前的旧值校验和结构化 `TapdApiError`。CLI 仍支持本地 fixture，真实接入使用 `TAPD_API_USER`、`TAPD_API_PASSWORD`。HTTP Client、Tool Pipeline、Workspace Conversation、Scheduler 和 Schedule 已通过本地最小闭环；下一步接入真实凭据和完整规则。

示例：用户要求“检查 TAPD 7A 所有需求单的迭代字段”。对应 Agent 认领任务，先调用只读审计 Tool，将报告发入 Conversation；若发现异常，Run 进入 `waiting` 并保存 approvalId，用户确认后由 `ApprovalResumer` 执行批准并恢复原 Run，再由写入 Tool 修改、保存平台回执并记录持久 Journal；App 会把 `receiptId` 转成用户可见消息。相同流程可由 Scheduler 定时唤醒；定时任务不绕过审批。写入结果未知时先调用 `verifyTapdUpdate()`，区分已完成、未完成和冲突，禁止自动重放。当前剩余工作是接入真实凭据和完整规则。
