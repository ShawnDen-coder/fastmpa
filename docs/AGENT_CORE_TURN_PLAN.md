# Agent Core Turn 实现计划

本计划只实现一个可测试的 Agent Turn，不实现 Runtime、数据库、API、Web、Electron 或真实平台连接器。原则是先理解一次 Turn 的完整生命周期，再向外扩展。

## 目标

完成下面的最小闭环：

```text
TurnInput
    ↓
ModelAdapter
    ↓
文本回复或 ToolCall
    ↓
ToolRegistry / ToolExecutor
    ↓
ToolResult 加回上下文
    ↓
TurnResult
```

## 组件划分

```text
packages/agent-core/src/
├── index.ts                 # 公开导出
├── types/
│   ├── message.ts           # Message、Role
│   ├── turn.ts              # TurnInput、TurnResult、TurnStatus
│   └── tool.ts              # ToolCall、ToolResult、ToolDefinition
├── model/
│   ├── adapter.ts            # ModelAdapter 接口
│   └── fake-model.ts         # 测试用 Fake Model
├── tools/
│   ├── definition.ts         # 工具定义
│   ├── registry.ts           # 工具注册和查找
│   └── executor.ts           # 参数校验、执行、异常包装
├── context/
│   └── context.ts            # Turn 消息上下文
├── guards/
│   ├── step-limit.ts         # 最大步数保护
│   └── cancellation.ts       # 取消控制
├── errors.ts                 # 可区分的错误类型
└── turn.ts                   # Turn 主循环
```

组件只允许向下依赖：

```text
types
  ↑
model / tools / context / guards
  ↑
turn
```

`turn.ts` 负责协调，不负责实现数据库、HTTP、APM 规则或外部平台操作。

## 分阶段实施

### 阶段 0：阅读与设计

阅读 Cumora：

1. `server/src/agents/turn.ts`；
2. `server/src/agents/tools.ts`；
3. `server/src/agents/turn-stream.ts`；
4. `server/src/agents/runtime/inproc-client.ts`。

产出一张 Turn 时序图，并写下 Turn、Tool、Runtime 三者的职责边界。不要开始接入真实 LLM。

### 阶段 1：定义类型

实现 `types/`：

- `Message`：角色、内容和可选元数据；
- `ToolDefinition`：名称、描述和参数 schema；
- `ToolCall`：工具名称和参数；
- `ToolResult`：成功或失败结果；
- `TurnStatus`：`done`、`waiting`、`blocked`、`needs_clarification`、`failed`；
- `TurnInput`、`TurnEvent`、`TurnResult`。

验收：类型可以表达文本回复、工具调用、工具失败和终止状态。

### 阶段 2：ModelAdapter 与 Fake Model

定义模型适配器接口，禁止 `turn.ts` 依赖具体 LLM SDK。Fake Model 用预设脚本返回：

- 最终文本；
- 一个 ToolCall；
- 多个 ToolCall；
- 模型错误。

验收：同一个输入可以稳定地产生同一个模型响应，测试不依赖网络。

### 阶段 3：ToolRegistry 与 ToolExecutor

实现工具注册、名称查找、参数校验、执行和异常包装。第一版使用内存工具，例如 `echo` 或 `add`，不连接数据库。

验收：未注册工具、非法参数和工具异常都能转换为明确的 `ToolResult`，不能伪装成成功。

### 阶段 4：Context 与 Guards

实现上下文消息追加和两个保护器：

- `StepLimitGuard`：达到最大步数后停止；
- `CancellationGuard`：收到取消信号后停止。

后续再考虑 Token、超时和费用预算，不在第一版引入模型供应商细节。

### 阶段 5：Turn 主循环

实现 `runTurn`：

```text
创建 Context
    ↓
请求 ModelAdapter
    ↓
返回 ToolCall？──否──→ 生成最终结果
    │
   是
    ↓
Registry 查找工具
    ↓
Executor 执行工具
    ↓
ToolResult 加入 Context
    ↓
检查 Guard 后继续下一轮
```

每一轮都应该产生可观察的 `TurnEvent`，但第一版不需要做网络流式传输。

### 阶段 6：测试与公开导出

补充 `src/__tests__/`：

- 直接文本回复；
- 单次和连续工具调用；
- 未注册工具；
- 参数校验失败；
- 工具执行失败；
- 模型错误；
- 最大步数；
- 取消；
- 每种终止状态。

最后通过 `src/index.ts` 只导出稳定的公共接口，不暴露内部循环状态。

## 技术要求

- TypeScript 严格模式；
- Node.js ESM；
- `node:test`；
- `tsc` 类型检查和构建；
- Fake Model 和内存工具；
- 不引入 OpenAI SDK、LangChain、数据库 ORM、HTTP 框架或 Electron。

## 验证命令

```bash
pnpm --filter agent-core typecheck
pnpm --filter agent-core test
pnpm --filter agent-core build
```

## 完成标准

完成后，你应该能解释：

1. Turn 与 Runtime 的边界；
2. 为什么模型不能直接执行任意函数；
3. 为什么工具必须经过注册和参数校验；
4. 为什么需要最大步数和取消机制；
5. 为什么第一版不接真实模型；
6. 如何让同一个 Turn 在测试中可重复运行。

只有本计划完成后，才创建 `packages/agent-runtime`。
