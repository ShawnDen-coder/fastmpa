# Next Steps

当前阶段是 V1 闭环稳定化，核心实现已经落地：

1. Runtime Tooling 的 Approval 已绑定 `runId`，并由 Application 统一执行批准/拒绝恢复。
2. Application 已接入 Schedule tick、启动补偿投影和多 Workspace snapshot。
3. TUI 已接入 `ink-testing-library` 基础渲染测试；后续补齐交互输入、审批和错误弹窗覆盖。
4. 保持 `apps/fastmpa` 为唯一 Application 调用方；暂不创建 Electron 或共享 Application 包。

完成以上事项后，再从模拟工具中选择第一个真实平台适配器；所有外部写操作仍必须经过 Runtime 审批、幂等和审计。
