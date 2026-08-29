# FastMPA 文档

## 当前方向

FastMPA 不是重新设计一套通用 Agent 编排平台，而是在 Cumora 的协作模型上扩充 APM 工作逻辑：

```text
Participant + Workspace
  → Inbox + Wake + Agenda + Scheduler
  → Runtime + Turn + Tools
  → APM Domain + Connectors
```

`agent-core` 和 `agent-runtime` 基础已经完成。当前重点是最小 Workspace 与持久 Inbox，随后贯通 Wake、Agenda 和 Scheduler；Requirement 等 APM 对象在协作闭环完成后接入。

## 文档索引

### 总体规划

- [项目 Roadmap](ROADMAP.md) — 唯一的总体阶段顺序、架构原则和包演进规划。
- [当前实施计划](NEXT_STEPS_PLAN.md) — 当前里程碑、手动实现步骤和验收条件。

### 已完成的基础阶段

- [Agent Core Turn 计划](AGENT_CORE_TURN_PLAN.md) — Turn、Model、Tool、Context 与 Guard。
- [Agent Runtime 计划](AGENT_RUNTIME_PLAN.md) — Run 生命周期、Store、Lease 和恢复设计。

### 后续领域阶段

- [APM Requirement 垂直切片](FASTMPA_DOMAIN_PLAN.md) — 延后到 Workspace 闭环之后的第一个 APM 扩展。
- [项目 README](../README.md) — Monorepo 结构与常用命令。

## 文档职责

- `ROADMAP.md` 回答“总体按什么顺序实现”。
- `NEXT_STEPS_PLAN.md` 回答“现在手动实现什么”。
- `*_PLAN.md` 记录某个阶段的学习目标、设计和验收，不再定义全局顺序。
- 包内 `README.md` 只说明该包的职责、API、目录和命令。

## 学习工作流

1. 阅读 Cumora 对应入口，确认它解决的具体问题。
2. 画出事件流、状态图及模块边界。
3. 先写最小类型和契约测试。
4. 由学习者手动实现一个可运行垂直切片。
5. 覆盖正常、失败、重复事件和恢复边界。
6. 复盘后再创建下一个包。
