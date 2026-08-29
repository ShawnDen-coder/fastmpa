# FastMPA 学习文档

## 当前路线

当前已完成 `agent-core`，正在收尾 `agent-runtime`，继续采用由内向外的实现顺序：

```text
Turn Engine → Durable Runtime → FastMPA Domain/Tools
→ Policy/Audit → Skills/MCP → Agenda → Connectors
→ API/UI → BYOA → 多角色
```

## 文档索引

- [Core 学习与实现计划](CORE_FIRST_PLAN.md) — 已完成的核心阶段与边界。
- [Agent Core Turn 计划](AGENT_CORE_TURN_PLAN.md) — Turn、Tool、Context 和 Guard 的实现细则。
- [Agent Runtime 学习与实施计划](AGENT_RUNTIME_PLAN.md) — 当前阶段：Run 生命周期、内存 Store、取消、恢复与后续远程化。
- [下一步学习与实施计划](NEXT_STEPS_PLAN.md) — 当前执行顺序：Runtime 一致性、崩溃恢复、APM 垂直切片、Policy/Audit、Skills/MCP。
- [项目 README](../README.md) — workspace、命令和子包入口。
- [agent-core 包](../packages/agent-core/) — 已完成的 Turn Engine 基础包。
- [agent-runtime 包](../packages/agent-runtime/) — 当前正在加固的运行时包。

## 学习工作流

1. 阅读 Cumora 对应的 2–3 个入口文件。
2. 画出数据流或状态图。
3. 在 FastMPA 写最小设计。
4. 手动实现一个垂直切片。
5. 为正常、失败和重复执行写测试。
6. 再进行代码审查和边界分析。

不要为了复刻 Cumora 而提前引入数据库、Redis、BYOA 或多角色；每个新包都必须有真实消费者和测试。

