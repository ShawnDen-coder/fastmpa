# FastMPA Roadmap

FastMPA 是一个以 Workspace 为协作事实、以 Agent Run 为可恢复执行单元的本地 Agent 工作台。用户提交任务，Agent 通过受控工具执行，系统持久化消息、运行、审批和计划状态，并可在进程重启后继续工作。

## 交付顺序

1. **核心收敛**：Core 定义 Turn/Model/Tool 协议，Runtime 负责 Run、租约、队列、恢复、重试、通知、调度、工具策略、审批和审计，Workspace 负责会话、消息、看板、Attention 和 Schedule；SQLite 是生产默认存储。
2. **Application 边界**：`apps/fastmpa/src/application.ts` 组合 Runtime 与 Workspace，提供命令、查询、订阅和生命周期；UI 不得直接访问 Store 或 SQLite。
3. **V1 TUI**：Commander 路由 `doctor` 与 `run`，Ink + React 提供 Workspace、Conversation、Run 三栏视图和输入操作。
4. **扩展**：在 Runtime 审批、幂等和审计边界内接入 Skills、MCP，再加入 TAPD 等平台适配器。
5. **V2 Electron**：只有在 TUI 与 Electron 都是实际调用方后，才提取共享 `fastmpa-application` 包；Electron Main 持有 Application 和执行权限，Renderer 只通过类型化 IPC 访问。

## 当前闭环

`fastmpa run "任务"` 会创建 Workspace Participant/Conversation，写入用户消息，以持久化 message ID 生成 Run ID，持久化并执行 Run，再把 Agent 回复写回 Conversation。Application 只向 RuntimeTooling 注册工具；Skills/MCP 仍属于后续扩展。

## 架构约束

- Core 不依赖平台或 UI。
- Runtime 不知道具体 UI 和平台领域规则。
- Workspace 保存事实，不实现执行队列。
- Application 是唯一的 UI 访问边界。
- 外部写操作必须经过 Runtime 的审批、幂等和审计流程。
