# Next Steps

当前阶段是 V1 基础闭环收敛，按以下五批维护和验收：

1. Desktop 使用 Electron Main/Preload/Renderer target 构建，并在 CI 实际运行 host smoke。
2. Runtime Tooling 统一由 `ToolCatalog`/`RuntimeTooling` 提供，Approval 必须绑定 `runId`。
3. Application 只使用公共 `AgentRuntime` facade；生产 Run Store 使用 SQLite Lease。
4. Schedule occurrence 使用稳定 Run ID，Workspace 不包含执行逻辑，调度不再使用 WorkClaim。
5. Application 使用共享 SQLite connection，并通过 CompletionProjector 与 receipt 恢复投影。

Skills、MCP、真实平台适配器和 Electron 不属于本轮 V1 基础架构范围。

完成以上事项后，再从模拟工具中选择第一个真实平台适配器；所有外部写操作仍必须经过 Runtime 审批、幂等和审计。

## Workspace 工作台推进状态（2026-08-30）

### 本批增量：实时事件链

- [x] Core 支持可选 `StreamingModelAdapter`；不支持流式的适配器继续走 `complete()`。
- [x] Core 通过 `TurnLiveEvent` 发出文本 delta、工具开始/审批/完成和 turn 完成事件。
- [x] Runtime 为实时事件附加 `runId`、attempt 和 RunContext；delta 只保留在内存，不写 SQLite 或 RuntimeEvent。
- [x] Application 通过 `subscribeEvents()` 向 Desktop Renderer 暴露 UI 无关的实时事件。
- [x] Core 与 Application 测试覆盖流式 delta、最终消息和运行上下文。
- [x] Desktop Renderer 订阅实时事件，在当前 Conversation 中显示流式文本和工具执行指示。
- [x] Desktop Renderer 提供 Rail 页面入口；Logs 页面显示日志面板。
- [x] Desktop Renderer 将 Conversation、Approval、RunDetails 和 Logs 视图拆为独立组件。
- [x] Desktop Renderer 默认使用 Conversation-first 单区渲染；Workspace、Runs 和 Logs 通过 Rail 进入。
- [x] `Ctrl+L` 打开 Logs 焦点视图，方向键滚动日志；日志按当前 Workspace/Conversation 保持上下文过滤。
- [x] 初始加载和 Workspace 切换按选中 Conversation 重新读取消息，避免 Workspace 内会话串消息。
- [x] 流式草稿、活动工具、队列计数和失败消息按 `workspaceId:conversationId` 隔离，切换 Conversation 不串本地状态。
- [x] Runs、Schedules 和 Attention 通过命令面板分别进入辅助视图，不再混合显示为固定右栏列表。
- [x] 命令面板支持 `g` 在当前 Workspace 的 Agent participant 之间切换，后续消息使用选中的 Agent。
- [x] Approval card 支持 ←/→ 选择 Approve、Reject、Details，Enter 确认；Ctrl+A/Ctrl+X 仍作为快捷操作。
- [x] 增加 40/80/120 列宽度策略；窄终端隐藏次要 Run metadata，不切换到另一套布局，并有单元测试覆盖。
- [x] Run Details 展示 Run 时间线、上下文、Tool Call、错误码/可重试性、Approval ID 和可用操作。
- [x] Desktop Renderer 发送失败时保留本地消息内容，并通过 Run Inspector 支持 Retry / Cancel。
- [x] Retry 直接重新提交保留的失败消息；Edit 回填 Composer，Discard 清除本地草稿。
- [x] 当前 Conversation 显示本地排队消息计数；日志视图支持按 component 循环过滤（`v`）。

本批完成 Desktop 重构的基础边界；仍按 Assumptions 保留未实现的 thinking 展示、Workspace 删除、完整 Agent 编辑和完整 Board UI。

- [x] 引入持久化 Workspace DTO，并在内存/SQLite Repository 提供创建、读取和稳定排序。
- [x] SQLite 启动时为历史 workspaceId 补建 Workspace；`default` 使用 `Default Workspace` 显示名。
- [x] Application 支持 `workspace.create`、`workspace.rename`、`conversation.create`。
- [x] Application Snapshot 支持按 Workspace/Conversation 选择范围读取。
- [x] Snapshot 携带当前 Workspace 的 Attention 摘要；Desktop 退出时发送 closing 状态。
- [x] 增加 ConversationRunCoordinator，保证同一 Conversation 的 submit 串行；不同 Conversation 可并行，失败后队列继续。
- [x] 审批 waiting Run 会占用当前 Conversation 队列，直到批准、拒绝或取消后才释放后续消息。
- [x] 完成 Desktop Rail、Workspace/Conversation 选择、创建/重命名、队列状态和审批基础交互。
- [x] Application 提供 500 条日志 Ring Buffer、实时订阅和 JSONL 文件输出；Desktop 支持 Logs 页面。
- [x] Desktop Logs 页面显示日志级别、组件和时间，并可打开日志文件位置。
- [x] 日志区域拥有独立焦点；方向键滚动时暂停自动跟随，恢复显示日志时回到最新记录；右栏方向键选择 Run。
- [x] 右栏快捷键按选中 Run 执行：Ctrl+A 批准 waiting Run，Ctrl+X 拒绝审批或取消活动 Run。
- [x] 模型上下文限制为最近 50 条 user/assistant 消息，并从 user 轮次边界截取。
- [x] 临时 SQLite E2E 覆盖 Workspace/Conversation 创建、三轮连续对话、范围切换、重启恢复。
- [x] Electron Desktop 启动 Main/Preload/Renderer，并由 Application 提供统一业务边界。
