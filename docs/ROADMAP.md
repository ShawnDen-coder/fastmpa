# FastMPA Roadmap

FastMPA 是一个以 Workspace 为协作事实、以 Agent Run 为可恢复执行单元的本地 Agent 工作台。用户提交任务，Agent 通过受控工具执行，系统持久化消息、运行、审批和计划状态，并可在进程重启后继续工作。

## 交付顺序

1. **核心收敛**：Core 定义 Turn/Model/Tool 协议，Runtime 负责 Run、租约、队列、恢复、重试、通知、调度、工具策略、审批和审计，Workspace 负责会话、消息、看板、Attention 和 Schedule；SQLite 是生产默认存储。
2. **Application 边界**：`apps/fastmpa/src/application/` 组合 Runtime 与 Workspace，提供命令、查询、订阅和生命周期；UI 不得直接访问 Store 或 SQLite。
3. **V1 Desktop**：Electron Main/Preload/Renderer 提供 Windows 桌面应用，Renderer 只通过类型化 IPC 访问 Application。界面采用 Slack 式 Workspace/Conversation 信息架构，并参考 Cumora 的视觉体系、面板交互和前端工程实践。
4. **扩展**：在 Runtime 审批、幂等和审计边界内接入 Skills、MCP，再加入 TAPD 等平台适配器。

## 当前闭环

Desktop Application 会创建 Workspace Participant/Conversation，写入用户消息，以持久化 message ID 生成 Run ID，持久化并执行 Run，再把 Agent 回复写回 Conversation。Application 只向 RuntimeTooling 注册工具；Skills/MCP 仍属于后续扩展。

当前优先事项是 Desktop 可用性整改：修复 IME 输入与流式事件性能，按 Conversation 隔离交互状态，接入 Tailwind，重组 Renderer，并将 Run、Approval、Schedule 和 Logs 纳入 Slack 式持续协作体验。具体执行项见 [Desktop 整改计划](NEXT_STEPS_PLAN.md)。

## 架构约束

- Core 不依赖平台或 UI。
- Runtime 不知道具体 UI 和平台领域规则。
- Workspace 保存事实，不实现执行队列。
- Application 是唯一的 UI 访问边界。
- 外部写操作必须经过 Runtime 的审批、幂等和审计流程。
