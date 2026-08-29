# FastMPA Examples

这些示例用于验收基础交互流程，不连接真实 TAPD，也不会执行写入操作。

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

示例使用 `apps/fastmpa/fixtures/tapd.json`，其中包含项目 `7A` 的正常、缺失和错误迭代数据。只读 Toolset 中没有注册任何写入工具，所以它只能产生检查报告，不会修改数据。

审查时重点判断：

- 明确指定 TAPD Agent 是否符合你的预期；
- Agent 是否应该自动调用审计 Tool；
- Tool 结果是否应该直接展示，还是由 Agent 总结；
- 总结写回 Conversation 是否应该成为默认行为。
