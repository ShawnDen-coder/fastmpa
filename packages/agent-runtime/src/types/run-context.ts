/** 用于把 Run 与上层 Agent/Workspace 工作来源关联的纯数据上下文。 */
export interface RunContext {
  readonly agentId: string;
  readonly workspaceId: string;
  readonly trigger: "mention" | "assignment" | "schedule" | "manual";
  readonly sourceRef?: {
    readonly type: "message" | "card" | "schedule";
    readonly id: string;
  };
}
