# Next Steps

当前阶段是 V1 基础闭环收敛，按以下五批维护和验收：

1. CLI 使用 Node target 构建，并在 CI 实际运行 `dist/index.js doctor`。
2. Runtime Tooling 统一由 `ToolCatalog`/`RuntimeTooling` 提供，Approval 必须绑定 `runId`。
3. Application 只使用公共 `AgentRuntime` facade；生产 Run Store 使用 SQLite Lease。
4. Schedule occurrence 使用稳定 Run ID，Workspace 不包含执行逻辑，调度不再使用 WorkClaim。
5. Application 使用共享 SQLite connection，并通过 CompletionProjector 与 receipt 恢复投影。

Skills、MCP、真实平台适配器和 Electron 不属于本轮 V1 基础架构范围。

完成以上事项后，再从模拟工具中选择第一个真实平台适配器；所有外部写操作仍必须经过 Runtime 审批、幂等和审计。
