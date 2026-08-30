# Examples

示例用于验证 Core、Runtime 和 Workspace 的基础协议，不连接真实业务平台。

```bash
pnpm --filter fastmpa build
node apps/fastmpa/dist/index.js doctor
node apps/fastmpa/dist/index.js run "整理今天的任务"
```

Runtime 内置调度与 Tooling，外部平台适配器应作为未来扩展注入，并继续遵循审批、幂等和审计边界。
