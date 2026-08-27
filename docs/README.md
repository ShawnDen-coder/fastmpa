# FastMPA 学习文档

## 当前路线

当前从 `packages/agent-core` 开始，采用由内向外的实现顺序：

```text
Turn Engine → Agent Runtime → Policy/Audit → Domain Tools
→ API → Persistence → Agenda → Connectors → UI/BYOA/多角色
```

## 文档索引

- [Core 学习与实现计划](CORE_FIRST_PLAN.md) — 当前阶段的主要任务。
- [Agent Core Turn 计划](AGENT_CORE_TURN_PLAN.md) — Turn、Tool、Context 和 Guard 的实现细则。
- [项目 README](../README.md) — workspace、命令和子包入口。
- [agent-core 包](../packages/agent-core/) — 当前正在学习和实现的核心包。

## 学习工作流

1. 阅读 Cumora 对应的 2–3 个入口文件。
2. 画出数据流或状态图。
3. 在 FastMPA 写最小设计。
4. 手动实现一个垂直切片。
5. 为正常、失败和重复执行写测试。
6. 再进行代码审查和边界分析。

不要为了复刻 Cumora 而提前引入数据库、Redis、BYOA 或多角色；每个新包都必须有真实消费者和测试。
