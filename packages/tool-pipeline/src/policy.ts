import type { RegisteredTool } from "./registry.js";

export type PolicyDecision = "allow" | "require_approval" | "deny";

export interface ToolPolicy {
  decide(tool: RegisteredTool, actorId: string): PolicyDecision;
}

export const defaultToolPolicy: ToolPolicy = {
  decide: (tool) => (tool.effect === "read" ? "allow" : "require_approval"),
};
