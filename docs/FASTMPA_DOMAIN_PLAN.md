# FastMPA APM Requirement 垂直切片

> 状态：已开始实施，对应 Roadmap M5。当前先完成最小 Requirement 迭代规则，完整状态机和持久 Repository 继续后置。

## 目标与边界

Requirement 是 Cumora 风格 Workspace 上的 APM 领域扩展，不是新的通用 Task。工作仍由 Card、Message、Event 承载；Requirement 保存 APM 规则，并通过引用关联协作上下文和外部平台对象。

```text
Workspace Card / Conversation
            ↕
      APM Requirement
            ↕
ExternalRef(TAPD / ShotGrid)
```

当前第一版只实现纯领域规则，不接 MCP、数据库或 Runtime。平台 Adapter 负责映射外部字段，模型只能提出 Tool 调用；状态转换、版本校验和证据要求仍由后续领域代码强制执行。

## 当前已实现

`packages/apm` 提供平台无关的 `RequirementSnapshot`、`RequirementIterationPolicy`
和纯函数 `evaluateRequirementIteration()`。TAPD Adapter 将平台字段映射为该快照，
再生成平台报告；因此“什么是合规”不再写死在 TAPD Tool 中。

Requirement 基础模型、状态机、`MemoryRequirementRepository`、
`SqliteRequirementRepository` 和 `RequirementService` 也已完成。所有状态变化必须经过领域动作和
`expectedVersion`；进入进行中需要负责人，进入待审核需要证据，交付需要审核记录。
当前 APM Tools 已提供 inspect、证据、状态动作和审核动作；FastMPA 已接入
`WorkspaceRepository → WorkspaceReferencePort`，并通过测试贯通
`Card → Scheduler → Attention → Turn → APM Tool → Requirement`。
当前已支持按 Workspace/状态/负责人查询、SQLite 持久化、多 Rule 组合和 Requirement Tools。
FastMPA 的 `createRequirementConversationReporter()` 已将动作、状态和版本写回 Conversation；
下一步补更完整的真实 APM 规则组合和查询结果报告。

## 前置条件

- Participant、Conversation/Message、Board/Card 已完成。
- `loadAttention(agentId)` 能可靠返回 Inbox 与 Agenda。
- Card assignment 或 Message mention 能通知 Agent Scheduler。
- Agent 能使用 Tool 回复消息和更新卡片。

完整 Requirement 状态机的持久化和 Workspace 适配仍需满足以上前置条件；当前领域切片已经满足最小依赖，后续按本计划扩展。

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
