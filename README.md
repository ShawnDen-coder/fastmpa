# FastMPA

FastMPA 是一个以 Workspace 为协作事实、以可恢复 Run 为执行单元的本地多 Agent 工作台。Human 与 Agent 都是 Workspace 中的一等 Participant，在同一个消息、看板、日程和项目上下文中协作。

## 最终实现目的

FastMPA 的目标不是提供一个只会回答问题的聊天机器人，也不是重新设计一套中央任务路由框架，而是建立一个能够持续协助用户完成项目工作的 Agent 团队。

不同 Agent 可以承担项目经理、制作人、需求分析、进度跟踪、风险检查等角色。它们能够理解工作空间中的项目事实，主动发现需要处理的事项，使用受控工具执行操作，并把结果写回协作空间。

未来可以通过 Skills、MCP 和平台适配器连接 TAPD、ShotGrid 等外部系统；外部写操作始终经过 Runtime Tooling 的审批、幂等和审计边界。

一个典型场景是：用户提交一个项目任务，指定或自动匹配 Agent。Agent 通过 `.env` 配置的 OpenRouter 模型创建持久化 Run，执行过程中展示步骤和工具调用；需要写入时进入审批，批准后恢复执行，完成后把结果写回 Conversation。用户也可以将任务保存为周期计划。

## 使用逻辑

用户通过日常协作行为发起和推进工作，而不需要学习一套特殊的 Agent 编排语法：

1. 用户发送消息、@Agent、创建卡片、分配负责人或更新项目状态。
2. Workspace 保存消息、卡片、日程和读取边界，并为目标 Agent 生成 Inbox/Agenda 视图。
3. Runtime Scheduler 接收变化提醒，加载待处理上下文并判断是否值得启动 Agent。
4. Agent Runtime 创建并执行持久化 Run，结合 Agent、Attention 和任务上下文决定行动。
5. Runtime Tooling 经过验证、权限和审计后，执行本地或外部工具。
6. 成功处理后推进读取边界并把结果写回 Workspace，形成可追踪、可继续协作的闭环。

```text
Workspace
  → Runtime Scheduler
  → Agent Runtime / Core Turn
  → Tooling
  → Workspace / future platform adapters
```

Agent 之间也使用相同机制协作：发送消息、@其他 Agent 或把卡片分配给对方，而不是依赖隐藏的中央编排器。

## 解决的问题

FastMPA 主要解决以下问题：

- 项目信息分散在聊天、看板、TAPD、ShotGrid 等不同系统中，缺少统一上下文。
- 用户需要反复查询状态、同步信息、跟踪进度和提醒负责人，协作成本高。
- 通用 AI 助手通常只响应当前提问，不能持续跟踪项目变化和未完成事项。
- 实时通知可能丢失或重复，缺少持久 Inbox 时 Agent 容易漏掉尚未处理的消息。
- 多个 Agent 缺少明确身份、工作边界和共享协作空间，容易重复执行或彼此冲突。
- 外部平台写操作缺少权限、审批、幂等和审计边界，难以安全自动化。
- 项目管理规则容易依赖人工记忆，需求状态、交付证据、风险和依赖关系难以稳定执行。

FastMPA 通过统一 Workspace、Runtime Scheduler、可恢复执行和受控 Tooling，将“回答问题”扩展为“持续协助用户完成项目任务”。

项目路线与学习实施计划见 [docs](docs/README.md)。

## 启动 Windows Desktop

首次运行或依赖变更后，在仓库根目录执行：

```powershell
pnpm install
pnpm --filter fastmpa build
pnpm --filter fastmpa exec electron .
```

`build` 会生成 Electron Main、Preload 和 Renderer；`electron .` 会启动本地 Desktop 应用。之后只修改源码时，重新执行 `pnpm --filter fastmpa build` 再启动即可。

### 开发环境

开发时使用 Vite Renderer dev server，支持 Renderer 热更新。首次启动需要先构建 Main 和 Preload：

终端 1：

```powershell
pnpm install
pnpm --filter fastmpa build
pnpm --filter fastmpa dev:renderer
```

终端 2：

```powershell
pnpm --filter fastmpa dev:electron
```

Electron 会自动连接 `http://localhost:5173`。修改 `src/renderer` 会热更新；修改 Main 或 Preload 后，停止 Electron，重新执行 `pnpm --filter fastmpa build`，再启动即可。

如需生成 Windows 安装包：

```powershell
pnpm --filter fastmpa build
pnpm --filter fastmpa package:win
```

安装包位于 `apps/fastmpa/release/`。Desktop 默认将 SQLite 和 JSONL 日志保存到 Electron 的 userData 目录。

## 日志

Application 创建唯一 root Pino logger，并向 Core、Runtime、Scheduler 和 Tooling 注入 child logger。默认日志只包含组件、关联 ID、状态、耗时、计数和错误，不写入消息正文、工具参数、工具结果或模型响应；密码、token、authorization、apiKey、cookie 和 secret 会被 redacted。

`FASTMPA_LOG_LEVEL` 控制级别，默认 `info`；`FASTMPA_LOG_PATH` 可指定日志文件，默认与 SQLite 文件同目录的 `fastmpa.log`。Desktop 日志写入 JSONL 文件，V1 不轮转日志，生产环境请使用外部轮转工具。

## 本地配置

Desktop Main 启动时读取环境变量。PowerShell 中可在启动前设置 OpenRouter：

```powershell
$env:OPENROUTER_API_KEY = "your-api-key"
$env:OPENROUTER_MODEL = "your-model"
$env:FASTMPA_LOG_LEVEL = "info"
pnpm --filter fastmpa exec electron .
```

也可以使用系统环境变量。禁止将 API key、密码或其他凭据提交到仓库。
