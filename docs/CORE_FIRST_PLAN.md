# FastMPA Core 学习与实现计划

FastMPA 采用“由内向外”的路线。第一阶段不做 Web、数据库、连接器或多角色，而是手动实现一个可测试的 Agent Core，再逐层加入 Runtime、策略、领域和基础设施。

## 一、核心边界

`Turn` 是一次 Agent 思考与工具调用循环；`Runtime` 是运行管理层，负责 Run ID、生命周期、取消、恢复、并发和调度。

```text
Turn Engine
    ↓
Agent Core
    ↓
Agent Runtime
    ↓
Policy / Audit
    ↓
Domain Tools
    ↓
API / Database / UI
```

第一版只实现单进程、内存存储、有限步数和可取消的最小版本，不复制 Cumora 的完整运行时。

## 二、第一阶段：Turn Engine

当前包：`packages/agent-core`。

目标循环：

```text
TurnInput
  ↓
ModelAdapter
  ↓
文本回复或 ToolCall
  ↓
ToolRegistry 校验并执行
  ↓
ToolResult 加回上下文
  ↓
TurnResult：done / waiting / blocked / failed
```

### 手动实现顺序

1. 在 `src/types/` 定义 `Message`、`ToolCall`、`ToolResult`、`TurnStatus`、`TurnInput`、`TurnResult`。
2. 定义 `ModelAdapter` 接口，先使用 Fake Model，不连接真实 LLM。
3. 实现 Tool Registry：注册工具、按名称查找、校验参数、执行并包装结果。
4. 实现 `runTurn`：支持有限步数的文本回复和工具调用循环。
5. 增加取消、模型错误、工具错误和超限错误。
6. 用 `Vitest` 补齐正常路径、失败路径和重复调用测试。

### 第一阶段必须验证

- 模型直接返回最终文本；
- 单次和连续多次工具调用；
- 未注册工具；
- 参数校验失败；
- 工具执行失败；
- 模型调用失败；
- 超过最大步数；
- Turn 中途取消；
- `done`、`waiting`、`blocked`、`needs_clarification` 状态。

## 三、第二阶段：Agent Runtime

只有 Turn 稳定后，才创建 `packages/agent-runtime`：

```text
packages/agent-runtime/
└── src/
    ├── runtime.ts       # 启动和管理 AgentRun
    ├── run-store.ts      # 第一版内存 Store
    ├── lifecycle.ts      # queued/running/waiting/done/failed
    ├── cancellation.ts   # 取消运行
    └── resume.ts         # 为后续恢复预留接口
```

Runtime 负责创建 `AgentRun`、调用 `agent-core`、保存事件、管理状态、限制并发和处理取消；不负责判断 APM 状态是否合法，也不直接访问外部平台。

## 四、后续扩展顺序

```text
agent-core
    ↓
agent-runtime
    ↓
policy + audit
    ↓
domain + agent-tools
    ↓
apps/api
    ↓
persistence
    ↓
agenda
    ↓
connectors
    ↓
Web / Electron / BYOA / 多角色
```

## 五、Cumora 阅读路径

按顺序阅读：

1. `server/src/agents/turn.ts`：一次 Turn 的主循环；
2. `server/src/agents/tools.ts`：工具定义、调用和结果处理；
3. `server/src/agents/turn-stream.ts`：事件与流式结果；
4. `server/src/agents/runtime/inproc-client.ts`：Runtime 如何调用 Turn；
5. `server/src/agents/runtime/server.ts`：Runtime 的服务端边界；
6. `server/src/agents/runtime/wake-bus.ts`：后续再学习唤醒与调度。

阅读每个文件时都回答：它解决的是 Turn 问题，还是 Runtime 问题？不要把两层职责混在一起。

## 六、技术边界

第一阶段使用 TypeScript、Node.js ESM、`Vitest` 和 `tsc`。暂不引入 OpenAI SDK、LangChain、数据库 ORM、HTTP 框架、Redis 或 Electron 依赖。

## 七、验收标准

完成 Core 第一版后，应能运行：

```bash
pnpm --filter agent-core typecheck
pnpm --filter agent-core test
pnpm --filter agent-core build
```

并能解释：Turn 与 Runtime 的区别、工具为什么必须校验、为什么需要最大步数和取消机制，以及 Core 为什么不能直接访问数据库和外部平台。
