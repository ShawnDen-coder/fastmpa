# FastMPA 文档

## 当前方向

FastMPA 是一个本地 Agent 工作台，先围绕任务、Run、审批、调度和恢复建立稳定闭环：

```text
Participant + Workspace
  → Runtime Scheduler
  → Runtime/Core + Tooling
  → future Skills / MCP / platform adapters
```

`agent-core`、`agent-runtime`、Workspace、Scheduler、Tooling 和平台适配器已有第一版实现。当前重点是先稳定本地任务、审批、调度和恢复闭环，再推进真实平台接入。

## 文档索引

### 总体规划

- [项目 Roadmap](ROADMAP.md) — 唯一的总体阶段顺序、架构原则和包演进规划。
- [当前实施计划](NEXT_STEPS_PLAN.md) — 当前里程碑、手动实现步骤和验收条件。

### 已完成的基础阶段

- [Agent Core Turn 计划](AGENT_CORE_TURN_PLAN.md) — Turn、Model、Tool、Context 与 Guard。
- [Agent Runtime 计划](AGENT_RUNTIME_PLAN.md) — Run 生命周期、Store、Lease 和恢复设计。

### 项目入口

- [项目 README](../README.md) — 产品目标、使用逻辑与常用命令。
- [最终架构](ARCHITECTURE.md) — 三个核心包、Electron Desktop、Application 和 Runtime 边界。

### Desktop 启动

从仓库根目录执行 `pnpm --filter fastmpa build` 构建 Electron Main、Preload
和 Renderer；Windows 安装包使用 `pnpm --filter fastmpa package:win` 生成。
配置变量见[项目 README](../README.md)的“启动 Windows Desktop”。

### 可运行示例

- [示例说明](../examples/README.md) — Core、Runtime 和 Workspace 的离线示例。

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
