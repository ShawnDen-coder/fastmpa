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
- [x] 模型上下文限制为最近 50 条 user/assistant 消息，并从 user 轮次边界截取。
- [x] 临时 SQLite E2E 覆盖 Workspace/Conversation 创建、三轮连续对话、范围切换、重启恢复。
- [x] `fastmpa`（无参数）与 `fastmpa chat` 进入同一持续工作台；`fastmpa run` 保持单次 JSON 输出。
