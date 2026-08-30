# FastMPA

FastMPA V1 的可执行应用。`src/application.ts` 是 UI 无关的组合边界，统一持有 SQLite-backed Workspace 与 Runtime；Commander 负责 CLI 路由，Ink TUI 通过 Application 查询、派发命令和订阅状态。

## Quickstart

```bash
pnpm --filter fastmpa build
node apps/fastmpa/dist/index.js doctor
node apps/fastmpa/dist/index.js run "整理今天的任务"
node apps/fastmpa/dist/index.js
```

开发阶段可直接运行源码；从仓库根目录执行时必须指定应用 root，确保 pnpm 能解析 Ink 等应用依赖：

```bash
pnpm exec vite-node --root apps/fastmpa apps/fastmpa/src/index.ts
pnpm exec vite-node --root apps/fastmpa apps/fastmpa/src/index.ts run "整理今天的任务"
```

默认使用 `.env` 中配置的 OpenRouter 模型和本地无副作用工具。生产工具应作为 Runtime Tooling 的受控实现注入，并遵循审批、幂等和审计边界。

## Commands

```bash
pnpm --filter fastmpa typecheck
pnpm --filter fastmpa test
pnpm --filter fastmpa build
```
