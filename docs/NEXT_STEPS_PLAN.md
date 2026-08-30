# Next Steps

当前阶段是 V1 基础闭环收敛，按以下五批维护和验收：

1. CLI 使用 Node target 构建，并在 CI 实际运行 `dist/index.js doctor`。
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
- [x] Application 通过 `subscribeEvents()` 向 TUI 暴露 UI 无关的实时事件。
- [x] Core 与 Application 测试覆盖流式 delta、最终消息和运行上下文。
- [x] TUI 订阅实时事件，在当前 Conversation 中显示流式文本和工具执行指示。
- [x] TUI 提供 `Ctrl+K` 命令面板入口；`Ctrl+L` 打开日志面板，`Esc` 返回 Conversation。
- [x] TUI 将 Conversation、InlineTool、ApprovalCard、RunDetails、StatusBar 和 CommandPalette 拆为独立组件；`Ctrl+D` 打开选中 Run 详情。
- [x] TUI 默认使用 Conversation-first 单区渲染；Workspace、Runs 和 Logs 通过焦点或快捷键进入，日志使用独立 `LogView`。
- [x] `Ctrl+L` 打开 Logs 焦点视图，方向键滚动日志；日志按当前 Workspace/Conversation 保持上下文过滤。
- [x] 初始加载和 Workspace 切换按选中 Conversation 重新读取消息，避免 Workspace 内会话串消息。
- [x] Run Details 展示 Run 时间线、上下文、Tool Call、错误码/可重试性、Approval ID 和可用操作。
- [x] TUI 发送失败时保留本地消息内容，并通过命令面板支持 Retry / Edit / Discard。

本轮未声称完成整个 V1 计划：正式的 conversation-first 单区布局、覆盖式 Run Details/Approval 卡片、日志的独立全屏视图与完整过滤器、消息失败后的 Retry/Edit/Discard，以及 40/80/120 列布局验收仍需后续批次实现。

- [x] 引入持久化 Workspace DTO，并在内存/SQLite Repository 提供创建、读取和稳定排序。
- [x] SQLite 启动时为历史 workspaceId 补建 Workspace；`default` 使用 `Default Workspace` 显示名。
- [x] Application 支持 `workspace.create`、`workspace.rename`、`conversation.create`。
- [x] Application Snapshot 支持按 Workspace/Conversation 选择范围读取。
- [x] Snapshot 携带当前 Workspace 的 Attention 摘要；TUI 退出时对未发送本地队列显示确认。
- [x] 增加 ConversationRunCoordinator，保证同一 Conversation 的 submit 串行；不同 Conversation 可并行，失败后队列继续。
- [x] 审批 waiting Run 会占用当前 Conversation 队列，直到批准、拒绝或取消后才释放后续消息。
- [x] 完成三栏 TUI 的三栏焦点、Workspace/Conversation 选择、创建/重命名、队列状态和审批快捷键基础交互。
- [x] Application 提供 500 条日志 Ring Buffer、实时订阅和 JSONL 文件输出；TUI 支持 `Ctrl+L` 折叠日志面板。
- [x] TUI 日志支持最低级别 `1/2/3/4`、当前 Run 过滤 `Ctrl+E`，并显示日志文件绝对路径。
- [x] 日志区域拥有独立焦点；方向键滚动时暂停自动跟随，恢复显示日志时回到最新记录；右栏方向键选择 Run。
- [x] 右栏快捷键按选中 Run 执行：Ctrl+A 批准 waiting Run，Ctrl+X 拒绝审批或取消活动 Run。
- [x] 模型上下文限制为最近 50 条 user/assistant 消息，并从 user 轮次边界截取。
- [x] 临时 SQLite E2E 覆盖 Workspace/Conversation 创建、三轮连续对话、范围切换、重启恢复。
- [x] `fastmpa`（无参数）与 `fastmpa chat` 进入同一持续工作台；`fastmpa run` 保持单次 JSON 输出。
