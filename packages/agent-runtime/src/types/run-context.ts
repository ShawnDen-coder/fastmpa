/** 用于把 Run 与上层 Agent/Workspace 工作来源关联的纯数据上下文。 */
export interface RunContext {
  readonly agentId: string;
  readonly toolNames?: readonly string[];
  readonly workspaceId: string;
  readonly conversationId?: string;
  readonly trigger:
    | "mention"
    | "routing"
    | "direct"
    | "assignment"
    | "schedule"
    | "manual";
  readonly sourceRef?: {
    readonly type: "message" | "card" | "schedule";
    readonly id: string;
  };
  readonly writeApproval?: "always" | "external";
  readonly externalApproval?: boolean;
  readonly approvalTimeoutMinutes?: number;
}
