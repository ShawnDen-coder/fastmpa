# FastMPA Examples

这些示例用于验收基础交互流程，不连接真实 TAPD，也不会执行写入操作。

## 各库最小示例

| 库 | 示例 | 关注点 |
| --- | --- | --- |
| `agent-core` | `openrouter-tapd-audit.ts` | Turn、Model、只读 Tool、日志 |
| `agent-runtime` | `agent-runtime-run.ts` | Run 生命周期和结果持久化接口 |
| `workspace` | `workspace-conversation.ts` | Participant、Conversation、Message |
| `agent-scheduler` | `agent-scheduler-wakeup.ts` | 消息/定时任务唤醒 Agent |
| `tool-pipeline` | `tool-pipeline-approval.ts` | 写入审批、执行和审计 |
| `apm` | `apm-requirement.ts` | 平台无关的业务规则 |
| `integrations` | `integrations-tapd-readonly.ts` | TAPD Adapter 和只读 Tool |

除 OpenRouter 示例外，示例均可离线运行：

```bash
pnpm --filter fastmpa-examples exec vite-node workspace-conversation.ts
pnpm --filter fastmpa-examples exec vite-node agent-runtime-run.ts
```

在 VS Code 中安装推荐的 `Code Runner` 扩展后，直接打开任意 `examples/*.ts`，点击右上角 `Run Code` 即可运行。仓库设置会使用 `vite-node`，并自动读取根目录 `.env`；OpenRouter 示例仍需要配置 `OPENROUTER_API_KEY` 和 `OPENROUTER_MODEL`。

## OpenRouter TAPD 审计闭环

`openrouter-tapd-audit.mjs` 模拟一个用户把任务交给 TAPD Agent：

```text
用户消息
  -> Workspace Conversation
  -> 指定 TAPD Agent
  -> OpenRouter Model
  -> tapd.auditRequirementIterations（只读 Tool）
  -> Agent 总结检查结果
  -> Conversation 回执
```

运行前在仓库根目录准备 `.env`：

```dotenv
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=your-model
```

然后执行：

```bash
pnpm --filter fastmpa-examples openrouter
```

示例直接由 `vite-node` 运行 TypeScript 源码，不要求先构建各个 package。

## 日志

示例使用 Agent Core 的 Pino logger。终端输出包含结构化的 `level`、`time`、`service`、`agentId` 和 `msg` 字段，同时写入：

```text
logs/openrouter-tapd-audit.log
```

可通过 `FASTMPA_LOG_PATH` 覆盖路径，例如：

```dotenv
FASTMPA_LOG_PATH=logs/fastmpa-review.log
```

其他应用可直接注入自己的路径：

```ts
createLogger({ agentId: "agent-tapd" }, { logPath: "logs/runtime.log" })
```

示例使用 `apps/fastmpa/fixtures/tapd.json`，其中包含项目 `7A` 的正常、缺失和错误迭代数据。只读 Toolset 中没有注册任何写入工具，所以它只能产生检查报告，不会修改数据。

审查时重点判断：

- 明确指定 TAPD Agent 是否符合你的预期；
- Agent 是否应该自动调用审计 Tool；
- Tool 结果是否应该直接展示，还是由 Agent 总结；
- 总结写回 Conversation 是否应该成为默认行为。
