# Agent Core Turn 实现计划

> 状态：已完成的基础阶段记录。当前全局顺序以 [项目 Roadmap](ROADMAP.md) 为准。

本计划描述 `packages/agent-core` 已经落地的最小 Turn 闭环，以及后续层必须保持的边界。

## 目标与数据流

```text
TurnInput
    ↓
Guard / CancellationSignal
    ↓
ModelAdapter
    ↓
文本、状态或 ToolCall
    ↓
ToolRegistry / ToolExecutor
    ↓
ToolResult 写回 TurnContext
    ↓
TurnResult
```

## 当前目录

```text
packages/agent-core/
├── src/
│   ├── index.ts                   # 稳定公共导出
│   ├── turn.ts                    # runTurn 主循环
│   ├── errors.ts                  # AgentCoreError
│   ├── logger.ts                  # Pino 日志
│   ├── types/
│   │   ├── message.ts
│   │   ├── tool.ts
│   │   └── turn.ts
│   ├── model/
│   │   ├── adapter.ts             # ModelAdapter 与请求控制参数
│   │   ├── errors.ts              # ModelExecutionError
│   │   ├── fake-model.ts
│   │   └── openrouter-model.ts
│   ├── tools/
│   │   ├── registry.ts            # 注册、名称检查、强制 validator
│   │   ├── executor.ts            # 解析、校验、执行、取消
│   │   └── errors.ts
│   ├── context/context.ts
│   └── guards/
│       ├── guard.ts
│       ├── step-limit.ts
│       └── cancellation.ts
├── tests/
│   ├── model.test.ts
│   ├── tools.test.ts
│   └── turn.test.ts
├── docs/architecture.mmd
└── scripts/
    ├── openrouter-smoke.mjs
    └── openrouter-turn-smoke.mjs
```

依赖方向保持为：

```text
types
  ↑
model / tools / context / guards
  ↑
turn
```

## 已完成阶段

### 1. 类型与上下文

已实现文本消息、assistant 工具调用消息、tool 结果消息，以及 `done`、`waiting`、`blocked`、`cancelled`、`needs_clarification`、`failed` 状态。

### 2. 模型边界

`ModelAdapter` 隔离供应商实现。`FakeModel` 提供确定性测试；`OpenRouterModel` 实现非流式 Chat Completions，并把供应商错误转换为 `ModelExecutionError`：

- `authentication_failed`：不可重试；
- `rate_limited`、`timeout`、服务端错误：可重试；
- `invalid_response`、配置错误：不可重试；
- 未知网络错误：由适配器显式标记是否可重试。

畸形 `tool_calls` 不会被静默忽略。

### 3. 工具边界

每个 `ToolImplementation` 必须提供：

```ts
{
  definition: { name, description, parameters },
  validate(argumentsValue, context) {},
  execute(argumentsValue, context) {},
}
```

`validate` 是运行时安全边界，即使工具没有参数也要显式写 `validate() {}`。工具名称禁止为空或带首尾空格。

### 4. Guard 与协作式取消

取消不只是在每轮开始检查：signal 还会传给模型、OpenRouter `fetch`、工具校验与执行，并在多个工具之间再次检查。耗时适配器和工具必须主动响应 signal。

### 5. Turn 主循环

`runTurn` 已支持文本结束、状态结束、单个/多个工具调用、工具错误回填、模型错误、取消和最大步数。每条结束路径都会生成 `turn_finished` 事件。

### 6. 测试与导出

测试覆盖模型错误分类、畸形响应、工具注册与执行、上下文顺序、连续工具调用、取消传播、重试语义和所有终止状态。公共接口从 `src/index.ts` 导出。

## 验证命令

```bash
pnpm --filter agent-core typecheck
pnpm --filter agent-core test
pnpm --filter agent-core build
```

当前验收：3 个测试文件、27 个测试、类型检查和构建全部通过。

## 当前边界

Core 已进入稳定阶段。Workspace、Runtime Scheduler、Tooling、审批、持久化和平台适配器均属于 Core 之外的边界；不要把 Participant、Attention、Scheduler 或业务规则加入 `turn.ts`。
