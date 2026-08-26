/**
 * FastMPA Agent Turn 的实现入口。
 *
 * Turn 表示 Agent 的“一次工作回合”，不是整个 Agent Runtime：
 *
 * - Turn 负责一次模型与工具之间的有限循环；
 * - Runtime 未来负责 Run ID、排队、恢复、并发、调度和持久化；
 * - Domain 负责 APM 业务规则；
 * - Policy / Audit 负责动作门禁和审计。
 *
 * 本文件未来应只负责协调下面的流程，不直接访问数据库、HTTP、
 * Electron 或外部平台：
 *
 * 1. 接收 TurnInput
 *       │
 *       ▼
 * 2. 创建或初始化 TurnContext
 *    - system message
 *    - 用户/事件消息
 *    - 可用工具定义
 *    - 当前 Turn 的元数据
 *       │
 *       ▼
 * 3. 检查取消信号和最大步数
 *       │
 *       ▼
 * 4. 调用 ModelAdapter
 *       │
 *       ├── 返回最终文本
 *       │       └── 生成 TurnResult，Turn 结束
 *       │
 *       ├── 返回 TurnStatus
 *       │       └── 记录 done / waiting / blocked /
 *       │           needs_clarification 等终止状态
 *       │
 *       └── 返回 ToolCall
 *               │
 *               ▼
 *          5. ToolRegistry 查找工具
 *               │
 *               ├── 工具不存在
 *               │       └── 生成失败的 ToolResult
 *               │
 *               └── 工具存在
 *                       │
 *                       ▼
 *                  6. ToolExecutor 校验并执行
 *                     - 校验工具名称和参数
 *                     - 执行受控工具
 *                     - 捕获异常
 *                     - 生成 ToolResult
 *                       │
 *                       ▼
 *                  7. 将 ToolCall / ToolResult 加入上下文
 *                       │
 *                       ▼
 *                  8. 回到第 3 步，开始下一轮
 *
 * Turn 必须在以下任一条件满足时结束：
 *
 * 1. 模型返回最终文本；
 * 2. 模型声明终止状态；
 * 3. 工具或模型发生不可恢复错误；
 * 4. 收到取消信号；
 * 5. 达到最大步数、超时或其他预算上限。
 *
 * 第 5 项是安全边界，不能依赖模型“自觉停止”。任何模型或工具异常
 * 都必须转换为明确的结果，不能伪装成成功，也不能让循环无限继续。
 *
 * 推荐实现顺序：
 *
 * 1. 先定义 types/turn.ts、types/tool.ts 和 types/message.ts；
 * 2. 定义 ModelAdapter，并用 FakeModel 驱动测试；
 * 3. 实现 ToolRegistry 和 ToolExecutor；
 * 4. 实现 Context 与最大步数/取消 Guard；
 * 5. 最后在本文件实现 runTurn 主循环；
 * 6. 为文本回复、工具调用、工具失败、模型失败、取消和超限补测试。
 *
 * 依赖方向应保持为：
 *
 * types / model / tools / context / guards
 *                    │
 *                    ▼
 *                  turn.ts
 *
 * 不要在这里加入 APM 状态机、审批、数据库 Repository 或 Connector。
 * 这些能力会在 Turn 稳定后由其他包通过工具和适配器接入。
 */

