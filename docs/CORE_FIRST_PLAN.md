# FastMPA Core 学习与实现计划

FastMPA 采用“由内向外”的路线：先手动实现可测试的 Agent Core，再逐层加入 Runtime、策略、领域和基础设施。当前 `agent-core` 第一版闭环已经完成，正在进行安全边界收尾。

## 一、核心边界

`Turn` 是一次有限的模型推理与工具调用循环；`Runtime` 负责 Run ID、生命周期、取消、恢复、并发、调度和持久化。

```text
Agent Core / Turn
    ↓
Agent Runtime
    ↓
Policy / Audit
    ↓
Domain Tools
    ↓
API / Persistence / UI
```

Core 不直接访问数据库、业务状态机或外部平台。外部能力只能通过已注册、已校验的工具接入。

## 二、第一阶段：Agent Core（已完成）

当前包：`packages/agent-core`。

```text
TurnInput
  ↓
Guard + CancellationSignal
  ↓
ModelAdapter
  ├── ModelResponse
  └── ModelExecutionError
  ↓
ToolRegistry → ToolExecutor
  ↓
TurnContext → TurnResult
```

当前实现包括：

1. `Message`、`ToolCall`、`ToolResult`、`TurnStatus` 和 `TurnEvent`；
2. `ModelAdapter`、`FakeModel` 和 `OpenRouterModel`；
3. `ToolRegistry`、强制参数校验和结构化工具错误；
4. `StepLimitGuard` 与协作式取消；
5. `runTurn` 有限主循环和 Pino 日志；
6. Vitest 正常、失败、取消、重试和协议测试。

`TurnStatus` 当前包含：`done`、`waiting`、`blocked`、`cancelled`、`needs_clarification`、`failed`。

## 三、关键安全约束

- 每个工具必须显式实现 `validate`；JSON Schema 只是模型提示，不代替运行时校验。
- 工具名称不能为空，也不能带首尾空格。
- `CancellationSignal` 会传给模型请求、OpenRouter `fetch`、工具校验和工具执行；多个工具之间也会重新检查。
- 未知模型错误默认不可重试；只有结构化错误明确标记后，Runtime 才能重试。
- 最大步数是强制边界，不能依赖模型主动停止。

## 四、验证状态

```bash
pnpm --filter agent-core typecheck
pnpm --filter agent-core test
pnpm --filter agent-core build
```

当前结果：3 个测试文件、27 个测试通过，类型检查和构建通过。真实 OpenRouter Turn 可使用：

```bash
pnpm --filter agent-core test:openrouter:turn
```

## 五、第二阶段：Agent Runtime

Core 提交稳定后创建 `packages/agent-runtime`：

```text
packages/agent-runtime/
└── src/
    ├── runtime.ts        # 创建并管理 AgentRun
    ├── run-store.ts      # 第一版内存 Store
    ├── lifecycle.ts      # queued/running/waiting/done/failed
    ├── cancellation.ts   # AbortController 与 Core 的适配
    └── resume.ts         # 恢复入口
```

Runtime 负责保存 Turn 事件、管理状态、限制并发与决定重试；不负责 APM 业务规则。

## 六、后续扩展顺序

```text
agent-core → agent-runtime → policy/audit → domain/agent-tools
→ API → persistence → agenda → connectors → UI/BYOA/多角色
```

## 七、Cumora 后续阅读路径

1. `server/src/agents/turn-stream.ts`：事件与流式结果；
2. `server/src/agents/runtime/inproc-client.ts`：Runtime 如何调用 Turn；
3. `server/src/agents/runtime/server.ts`：Runtime 服务边界；
4. `server/src/agents/runtime/wake-bus.ts`：唤醒与调度。

阅读时继续区分：这是 Turn 内部问题，还是 Runtime 生命周期问题？
