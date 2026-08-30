# agent-core

`agent-core` 是 FastMPA 的 Agent 核心包，负责执行一次有限的 Agent Turn：请求模型、调用已注册工具、将结果写回上下文，并返回可观察的执行结果。

## 核心边界

```text
TurnInput → Guard → ModelAdapter → ModelResponse
                         │
                         └→ ModelExecutionError

ToolCall → ToolRegistry → ToolExecutor → TurnContext → TurnResult
```

本包不负责 Runtime 调度、持久化、领域业务规则、权限审批或外部平台连接。

## Quickstart

使用 `FakeModel` 可以离线验证一次 Turn；使用 `OpenRouterModel` 时只需替换模型并配置环境变量：

```ts
const result = await runTurn(
  { messages: [{ role: "user", content: "开始检查" }] },
  { model: new FakeModel([{ type: "text", content: "完成" }]), tools },
)
console.log(result.status, result.messages)
```

OpenRouter 只用于模型适配器验证；产品级任务闭环由 `apps/fastmpa` 的 Application 负责，运行：

```bash
pnpm --filter fastmpa doctor
```

## 目录结构

```text
src/
├── index.ts                 # 公共导出
├── turn.ts                  # runTurn 主循环
├── errors.ts                # AgentCoreError
├── types/                   # Message、Turn、Tool 协议
├── context/context.ts       # 消息上下文
├── model/
│   ├── adapter.ts           # ModelAdapter
│   ├── errors.ts            # ModelExecutionError
│   ├── fake-model.ts
│   └── openrouter-model.ts
├── tools/
│   ├── registry.ts          # 注册和运行时校验契约
│   ├── executor.ts          # 解析、校验、执行
│   └── errors.ts
├── guards/                  # 取消和最大步数
└── logger.ts

tests/
├── model.test.ts
├── tools.test.ts
└── turn.test.ts
```

## 注册工具

工具必须提供运行时 validator。`parameters` 只用于告诉模型参数格式，不能代替校验。

```ts
const tools = new ToolRegistry()

tools.register({
  definition: {
    name: 'add',
    description: '计算两个数字的和',
    parameters: {
      type: 'object',
      properties: {
        left: { type: 'number' },
        right: { type: 'number' },
      },
      required: ['left', 'right'],
    },
  },
  validate(value) {
    if (!value || typeof value !== 'object') {
      throw new Error('arguments must be an object')
    }
  },
  execute(value, context) {
    if (context.signal?.aborted) {
      throw new ToolExecutionError('cancelled', 'tool cancelled')
    }
    // 完整工具应在 validate 后安全收窄参数类型。
    return value
  },
})
```

工具名称不能为空或带首尾空格。即使工具没有参数，也要显式提供 `validate() {}`。

## 模型错误与取消

`OpenRouterModel` 使用 `ModelExecutionError` 区分认证失败、限流、超时、网络失败、取消和异常响应。未知错误默认不可重试，Runtime 只能在 `retryable: true` 时安排重试。

取消采用协作式机制：`CancellationSignal` 会传到模型请求、OpenRouter `fetch`、工具校验和工具执行。耗时实现必须监听或检查 signal。

## 命令

```bash
pnpm --filter agent-core typecheck
pnpm --filter agent-core test
pnpm --filter agent-core build
pnpm --filter agent-core test:openrouter:turn
```

OpenRouter 测试需要在仓库根目录 `.env` 配置 `OPENROUTER_API_KEY` 和 `OPENROUTER_MODEL`。

## 架构图

详见 [docs/architecture.mmd](docs/architecture.mmd)。
