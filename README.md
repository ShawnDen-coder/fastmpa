# FastMPA

FastMPA 是一个面向项目管理与制作管理（APM）场景的多 Agent 协作系统。它延续 Cumora 的核心逻辑：Human 与 Agent 都是 Workspace 中的一等 Participant，在同一个消息、看板、日程和项目上下文中协作。

## 最终实现目的

FastMPA 的目标不是提供一个只会回答问题的聊天机器人，也不是重新设计一套中央任务路由框架，而是建立一个能够持续协助用户完成项目工作的 Agent 团队。

不同 Agent 可以承担项目经理、制作人、需求分析、进度跟踪、风险检查等角色。它们能够理解工作空间中的项目事实，主动发现需要处理的事项，使用受控工具执行操作，并把结果写回协作空间。

系统最终将连接 TAPD、ShotGrid 等外部平台，让 Agent 在保持统一协作逻辑的同时读取和操作不同平台的数据。

## 使用逻辑

用户通过日常协作行为发起和推进工作，而不需要学习一套特殊的 Agent 编排语法：

1. 用户发送消息、@Agent、创建卡片、分配负责人或更新项目状态。
2. 新消息进入该 Agent 的 Inbox；卡片、日程和承诺进入 Agenda 的关注范围。
3. Workspace 记录持久化事实，并发送可丢失、可合并的 WakeSignal，提醒相关 Agent 检查工作。
4. Inbox/Agenda Triage 判断是否值得启动主 Agent，Scheduler 再调度 Runtime 执行一次 Turn。
5. Agent 根据 Persona、Memory、Skills、Inbox 和 Agenda 作出判断，通过 Tools 回复消息、更新卡片或操作外部平台。
6. 成功处理后推进读取边界并把结果写回 Workspace，形成可追踪、可继续协作的闭环。

```text
Workspace Event
  → Wake Agent
  → Inbox / Agenda
  → Triage / Scheduler
  → Runtime / Turn
  → Tools
  → Workspace Event
```

Agent 之间也使用相同机制协作：发送消息、@其他 Agent 或把卡片分配给对方，而不是依赖隐藏的中央编排器。

## 解决的问题

FastMPA 主要解决以下问题：

- 项目信息分散在聊天、看板、TAPD、ShotGrid 等不同系统中，缺少统一上下文。
- 用户需要反复查询状态、同步信息、跟踪进度和提醒负责人，协作成本高。
- 通用 AI 助手通常只响应当前提问，不能持续跟踪项目变化和未完成事项。
- 实时通知可能丢失或重复，缺少持久 Inbox 时 Agent 容易漏掉尚未处理的消息。
- 多个 Agent 缺少明确身份、工作边界和共享协作空间，容易重复执行或彼此冲突。
- 外部平台写操作缺少权限、审批、幂等和审计边界，难以安全自动化。
- 项目管理规则容易依赖人工记忆，需求状态、交付证据、风险和依赖关系难以稳定执行。

FastMPA 通过统一 Workspace、持久 Inbox、事件驱动 Wake、Agent Agenda、受控 Tools 和 APM 领域规则，将“回答问题”扩展为“持续协助用户完成项目任务”。

项目路线与学习实施计划见 [docs](docs/README.md)。
