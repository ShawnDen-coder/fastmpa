import type { RegisteredTool } from "./registry.js";

export type PolicyDecision = "allow" | "require_approval" | "deny";

export interface ToolPolicy {
  decide(
    tool: RegisteredTool,
    context: ToolPolicyContext | string,
  ): PolicyDecision;
}

export interface ToolPolicyContext {
  readonly actorId: string;
  readonly workspaceId?: string;
  readonly runId?: string;
  readonly writeApproval?: "always" | "external";
  readonly externalApproval?: boolean;
}

export const defaultToolPolicy: ToolPolicy = {
  decide: (tool, rawContext) => {
    const context: ToolPolicyContext =
      typeof rawContext === "string" ? { actorId: rawContext } : rawContext;
    if (tool.effect === "read")
      return tool.scope === "external" && context.externalApproval !== false
        ? "require_approval"
        : "allow";
    if (tool.scope === "external") return "require_approval";
    return context.writeApproval === "external" ? "allow" : "require_approval";
  },
};
