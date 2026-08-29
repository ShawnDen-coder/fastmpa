import type { Requirement } from "./requirement.js";

export interface RequirementRuleViolation {
  readonly ruleId: string;
  readonly requirementId: string;
  readonly message: string;
}

export interface RequirementRule {
  readonly id: string;
  evaluate(requirement: Requirement): RequirementRuleViolation | undefined;
}

export interface RequirementRuleReport {
  readonly inspectedCount: number;
  readonly violations: readonly RequirementRuleViolation[];
}

/** 组合多个纯业务规则；规则之间没有平台、工具或 Runtime 依赖。 */
export function evaluateRequirementRules(
  requirements: readonly Requirement[],
  rules: readonly RequirementRule[],
): RequirementRuleReport {
  const violations: RequirementRuleViolation[] = [];
  for (const requirement of requirements)
    for (const rule of rules) {
      const violation = rule.evaluate(requirement);
      if (violation) violations.push(violation);
    }
  return { inspectedCount: requirements.length, violations };
}
