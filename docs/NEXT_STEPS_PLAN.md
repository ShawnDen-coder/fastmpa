# Desktop 整改计划

当前阶段是 Windows Desktop 可用性与前端架构整改。产品采用 **Slack 式 Agent Workspace**：以 Workspace 和 Conversation 组织持续协作，以 Cumora 作为视觉体系、面板交互和前端工程质量参考。FastMPA 的 Run、Approval、Schedule、Tooling 和 Logs 仍是一等能力，不复制 Cumora 的业务导航。

## 交付批次

### 1. 输入与流式性能

- [x] Composer 正确处理中文 IME；Enter 发送，Shift+Enter 换行，组合输入确认不得误发送。
- [x] 草稿和 pending 状态按 Conversation 隔离；同一 Conversation 串行，不同 Conversation 可并行。
- [x] 发送中再次提交进入当前 Conversation 队列；键盘和发送按钮行为一致。
- [x] Main 将实时事件按数组批量发送，Renderer 在一次 Store 更新中归并事件、文本 delta 和工具状态。
- [x] 持久化消息、流式消息、工具步骤和失败卡片进入同一虚拟时间线。
- [x] Conversation 列表使用预计算摘要，禁止渲染时为每个会话扫描全部消息和 Run。
- [x] Logs 使用独立环形缓冲区；只有 Logs 页面订阅日志正文。

验收：中文输入无误发送；流式输出期间输入保持响应；一个 Conversation 运行时可以在另一个 Conversation 正常发送。

### 2. Slack 式 Agent Workspace

- [x] Desktop 使用 `44px TitleBar + 72px Rail + 可调 Conversation 栏 + 主内容区 + 按需 Context Pane`。
- [x] TitleBar 提供 Workspace 切换、模型/连接状态、搜索和窗口控制。
- [x] Rail 固定提供 Conversations、Runs、Schedules、Agents、Logs 和 Settings；未读与待审批使用徽标提示。
- [x] Conversation 栏按对话、Agent 和计划分组，保留搜索、未读、草稿和活动 Run 摘要。
- [x] 中央区域提供连续对话；Agent 回复、Run 摘要和工具调用保持在同一任务上下文中。
- [x] 右侧 Context Pane 互斥展示 Conversation 信息、Run 时间线、工具调用、审批或错误详情。
- [x] Runs、Schedules、Agents 和 Logs 保留独立完整页面，并可从 Conversation 上下文双向跳转。
- [x] 使用应用内 Dialog 替换 `window.prompt`，统一命令 pending、成功和可恢复错误反馈。

Slack 只作为 Workspace、Conversation、Thread、未读和持续输入的信息架构参考；Cumora 只作为色彩、密度、圆角、面板、动效、滚动和加载细节参考。

### 3. 项目目录、Tailwind 与 Renderer 重组

目标目录固定为：

```text
apps/fastmpa/
├─ resources/                       # Windows 图标和打包静态资源
├─ scripts/                         # 开发、打包和 smoke 脚本
├─ src/
│  ├─ application/                  # UI 无关的应用组合边界
│  │  ├─ application.ts
│  │  ├─ bootstrap.ts
│  │  ├─ orchestrator.ts
│  │  ├─ conversation-run-coordinator.ts
│  │  └─ logging.ts
│  ├─ main/                         # Electron Main 与 OS 能力
│  │  ├─ main.ts
│  │  ├─ ipc-handlers.ts
│  │  ├─ event-batcher.ts
│  │  ├─ navigation-policy.ts
│  │  ├─ renderer-path.ts
│  │  ├─ window-state.ts
│  │  └─ migrations/                # Desktop 数据目录兼容迁移
│  ├─ preload/
│  │  └─ preload.ts                 # 唯一 contextBridge 入口
│  ├─ shared/
│  │  ├─ contracts/                 # Command、DTO、Event、Snapshot、错误
│  │  ├─ ipc/                       # channel、校验和 response envelope
│  │  └─ index.ts                   # Main/Preload/Renderer 公共导出
│  └─ renderer/
│     ├─ app/                       # DesktopShell、Providers、view navigation
│     ├─ features/
│     │  ├─ conversations/
│     │  ├─ runs/
│     │  ├─ approvals/
│     │  ├─ schedules/
│     │  ├─ agents/
│     │  ├─ logs/
│     │  └─ settings/
│     ├─ components/ui/             # 应用内可复用基础组件
│     ├─ stores/                    # 领域 Store 与稳定 selector
│     ├─ styles/                    # Tailwind 入口和设计令牌
│     ├─ index.html
│     └─ main.tsx                   # 只负责 React 挂载
├─ tests/
│  ├─ application/                  # Application 与 SQLite E2E
│  ├─ main/                         # IPC、窗口、迁移和生命周期
│  ├─ renderer/                     # Store 与组件测试
│  └─ architecture/                 # 跨层导入规则
├─ package.json
├─ tsconfig.json
├─ vite.main.config.ts
├─ vite.preload.config.ts
└─ vite.renderer.config.ts
```

- [x] 删除无实际包入口职责的 `src/index.ts`；Application 只由 Main 装配，不将 Desktop 私有实现伪装成库导出。
- [x] 删除 Desktop 旧工作目录数据库迁移；Runtime Drizzle migrations 继续保留并纳入打包验证。
- [x] 所有测试统一移动到顶层 `tests` 的对应分层目录，源码目录不再混放 `*.test.ts`。
- [x] `tsconfig.json` 明确覆盖 `src`、`tests` 和三个 `vite.*.config.ts`；构建配置必须进入类型检查。
- [x] 禁止新增 `utils`、`common`、`misc` 等无职责目录；共享代码必须归属 `shared/contracts`、`shared/ipc`、`components/ui` 或具体 feature。
- [x] Feature 不得相互导入内部文件；跨 Feature 协作通过 app navigation、公共 Store action 或 shared contract。
- [x] Main 不导入 Renderer，Renderer 不导入 Main/Application 实现，Preload 只依赖 shared contract 和 IPC channel。

- [x] Renderer 接入 Tailwind CSS 4 和 Vite 插件；Main、Preload、Application 与核心包不得依赖 Tailwind。
- [x] 建立 FastMPA 设计令牌，统一颜色、字体、间距、圆角、阴影、状态色、面板宽度和动画时长。
- [x] 全局 Tailwind 入口只保留窗口拖动、滚动条、Markdown、文本选择、动画和设计令牌；组件规则移入 `styles/components.css`。
- [x] 按目标目录渐进迁移：先建立 shared contract，再拆 Store 和 Shell，随后按 Feature 移动页面，最后删除旧 `page-view.tsx` 和集中式 `styles.css`。
- [x] 可序列化 Command、Event、DTO 和 Snapshot 查询移动到 `shared/contracts`；Renderer 和 Preload 不再导入 Application 实现文件。
- [x] Application 继续保留在 `apps/fastmpa`，不提前提取共享包。
- [x] 暂不创建 Storybook package；基础组件先由 Desktop 应用内复用，出现第二个真实 UI 调用方后再评估提取。

### 4. Snapshot、生命周期与测试

- [x] 将完整 Snapshot 拆为 Shell、Conversation 和 Run 查询；实时 delta 不触发完整 Snapshot 广播。
- [x] Snapshot 失效事件携带 Workspace、Conversation、Dispatch 或 Run 作用域，Renderer 只刷新受影响的数据。
- [x] 命令更新只发布作用域失效；完整 Snapshot 仅在启动时广播，保持事件顺序和最终持久化消息一致。
- [x] Application 统一处理关闭 deadline：停止接收命令、中断活动 Run、刷新投影，最后关闭 Store。
- [x] Pino 日志在 Application、Runtime 和 Scheduler 边界携带 `workspaceId`、`conversationId`、`runId`、`command` 和 `component`（可用字段按事件范围出现）。
- [x] 增加 Composer IME、批量事件、Conversation 并行、虚拟时间线、面板导航和日志过滤测试。
- [x] 使用临时 SQLite 验证连续多轮对话、审批恢复、计划任务和重启恢复。
- [x] 增加 Windows 打包产物的 Electron 交互冒烟测试和 Renderer 架构导入检查。

## 完成标准

每个批次先运行受影响 package 的测试，再执行 `just ci`。四批全部完成后，Desktop 应满足：连续对话稳定、中文输入正常、流式输出不卡住 Composer、Workspace 状态隔离、Run/审批可追踪、日志可调试、重启可恢复，并且源码、契约、测试与 Electron 进程边界符合上述目标目录。

Skills、MCP 和真实平台适配器继续排在本轮 Desktop 整改之后；所有外部写操作仍必须经过 Runtime 的审批、幂等和审计边界。
