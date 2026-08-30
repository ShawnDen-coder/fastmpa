# FastMPA

FastMPA Windows Desktop 应用。`src/application.ts` 是 UI 无关的组合边界，统一持有 SQLite-backed Workspace 与 Runtime；Electron Main 持有 Application，Renderer 通过 preload bridge 访问类型化 API。

## Quickstart

```bash
pnpm --filter fastmpa build
pnpm --filter fastmpa package:win
```

开发阶段构建 Main、Preload 和 Renderer 三个产物：

```bash
pnpm --filter fastmpa typecheck
pnpm --filter fastmpa build
```

默认使用 `.env` 中配置的 OpenRouter 模型和本地无副作用工具。生产工具应作为 Runtime Tooling 的受控实现注入，并遵循审批、幂等和审计边界。

当前 Desktop shell 提供 FastMPA 品牌窗口和安全进程边界；Workspace、Conversation、Run、Approval、Schedule 和 Logs 页面按交付批次接入。

```bash
pnpm --filter fastmpa typecheck
pnpm --filter fastmpa test
pnpm --filter fastmpa build
```
