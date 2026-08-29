# FastMPA APM Requirement 垂直切片

> 状态：计划中，对应 Roadmap M5。必须在 Workspace、Agent Scheduler、Runtime/Core 和 Tool Pipeline 闭环完成后实施。

## 目标与边界

Requirement 是 Cumora 风格 Workspace 上的 APM 领域扩展，不是新的通用 Task。工作仍由 Card、Message、Event 承载；Requirement 保存 APM 规则，并通过引用关联协作上下文和外部平台对象。

```text
Workspace Card / Conversation
            ↕
      APM Requirement
            ↕
ExternalRef(TAPD / ShotGrid)
```

第一版使用内存 Repository，不接 MCP、数据库或真实平台。模型只能提出 Tool 调用；状态转换、版本校验和证据要求由领域代码强制执行。

## 前置条件

- Participant、Conversation/Message、Board/Card 已完成。
- `loadAttention(agentId)` 能可靠返回 Inbox 与 Agenda。
- Card assignment 或 Message mention 能通知 Agent Scheduler。
- Agent 能使用 Tool 回复消息和更新卡片。

缺少任一条件时，返回 [当前实施计划](NEXT_STEPS_PLAN.md)，不要提前创建 APM 包。

## 包边界

```text
packages/
└── apm/          # Requirement、状态机、Repository 端口与 APM Tools
```

`apm` 包可以依赖稳定的 Workspace ID/Reference 和 Tool 契约，但不依赖 Agent Runtime、模型、数据库或平台 SDK。包内 `requirement/` 领域代码不依赖 Tool；只有 `tools/` 适配层依赖领域代码和 Core Tool 契约。第一版不为此拆成两个包。

建议目录：

```text
apm/src/requirement/
├── requirement.ts
├── lifecycle.ts
├── repository.ts
├── memory-repository.ts
└── service.ts

apm/src/tools/requirement/
├── inspect-requirement.ts
├── update-status.ts
├── add-comment.ts
└── request-review.ts
```

## 最小模型

Requirement 至少包含：`id`、`workspaceId`、`title`、`status`、`ownerId`、`cardId`、`externalRefs`、`version`、`updatedAt`、`comments` 和 `evidence`。

```text
needs_clarification → confirmed → in_progress → review_pending
                                              ↑          │
                                              └─ rework ─┘
                                                         │
                                                     delivered
```

进入 `in_progress` 必须有负责人；进入 `review_pending` 必须有交付证据；进入 `delivered` 必须有审核通过记录。禁止公开通用 `setStatus()` 绕过状态机。

## 手动实现顺序

1. 定义 Requirement、Workspace 引用和 `ExternalRef` 值类型。
2. 先写状态机测试，再实现合法转换和前置条件。
3. 定义 `RequirementRepository` 的 `get/save(expectedVersion)`，并完成内存契约测试。
4. 实现 inspect、comment、update status、request review 四个用例。
5. 将用例适配为 Core Tool，统一处理参数错误、业务拒绝和版本冲突。
6. 从已指派 Card 通知 Scheduler，让 Agent 读取 AttentionSnapshot 与 Requirement 后更新状态并回复 Conversation。

## 验收标准

- Requirement 必须属于一个 Workspace，并关联可追踪的 Card 或 Conversation。
- 不同 Workspace 的 Participant、Card 和 Requirement 不能交叉引用。
- 领域包不依赖 TAPD、ShotGrid、模型或 Runtime。
- 所有状态变化经过状态机和乐观锁。
- 至少一个测试贯通 `Card → Scheduler → Attention → Turn → APM Tool → Requirement/Card`。
- 真实平台写回仍保持关闭，直到 Policy/Audit/幂等边界完成。
