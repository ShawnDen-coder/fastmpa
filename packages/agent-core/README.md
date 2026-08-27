# agent-core

`agent-core` 是 FastMPA 的 Agent 核心包，负责执行一次有限的 Agent Turn：请求模型、调用已注册工具、将工具结果写回上下文，并返回可观察的执行结果。

## 核心边界

```text
TurnInput → ModelAdapter → ToolCall
                         ↓
              ToolRegistry / ToolExecutor
                         ↓
                  TurnContext → TurnResult
```

本包不负责 Runtime 调度、数据库持久化、APM 业务规则、权限审批或外部平台连接。它只提供可测试的内存执行闭环。

## 目录结构

```text
src/
├── index.ts                 # 稳定公共导出
├── turn.ts                  # runTurn 主循环
├── types/                   # Message、Turn、Tool 等协议类型
├── context/context.ts       # Turn 消息上下文
├── model/
│   ├── adapter.ts           # ModelAdapter 接口
│   ├── fake-model.ts        # 可重复测试的模型
│   └── openrouter-model.ts  # OpenRouter 适配器
├── tools/
│   ├── registry.ts          # 工具注册与定义暴露
│   ├── executor.ts          # 参数解析、校验与执行
│   └── errors.ts            # 工具错误
├── guards/                  # 取消与最大步数保护
└── logger.ts                # Pino 日志

tests/
├── tools.test.ts            # Registry、Executor、Context 测试
└── turn.test.ts             # Turn 生命周期测试

docs/architecture.mmd       # Mermaid 架构图
scripts/                     # OpenRouter smoke 测试脚本
```

## 学习与实现路线

1. 理解 `Message`、`ToolCall` 和 `TurnResult` 协议。
2. 使用 `FakeModel` 验证文本回复和工具调用循环。
3. 学习 Registry、参数校验和结构化错误。
4. 学习 Guard 如何限制取消和最大步数。
5. 使用 OpenRouter 验证真实模型闭环。
6. Core 稳定后，再实现 `agent-runtime`。

## 命令

```bash
pnpm --filter agent-core typecheck
pnpm --filter agent-core test
pnpm --filter agent-core build
pnpm --filter agent-core test:openrouter:turn
```

最后一个命令需要在仓库根目录 `.env` 中配置 `OPENROUTER_API_KEY` 和 `OPENROUTER_MODEL`。

## 架构图

详见 [docs/architecture.mmd](docs/architecture.mmd)。
