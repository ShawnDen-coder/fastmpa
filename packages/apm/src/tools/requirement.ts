import type { RegisteredTool } from "tool-pipeline";
import type { Requirement } from "../requirement/requirement.js";
import type { RequirementService } from "../requirement/service.js";

export interface RequirementToolContext {
  readonly now: () => string;
  readonly createId: () => string;
  readonly onChanged?: (
    requirement: Requirement,
    action: string,
  ) => void | Promise<void>;
}

/** 将领域动作暴露给 Agent；工具不绕过 RequirementService。 */
export function createRequirementTools(
  service: RequirementService,
  context: RequirementToolContext,
): readonly RegisteredTool[] {
  const transition = (
    name: string,
    description: string,
    action: (
      workspaceId: string,
      requirementId: string,
      version: number,
      now: string,
    ) => Requirement,
  ): RegisteredTool => ({
    definition: {
      name: `apm.${name}`,
      description,
      parameters: {
        type: "object",
        required: ["workspaceId", "requirementId", "expectedVersion"],
        properties: {
          workspaceId: { type: "string" },
          requirementId: { type: "string" },
          expectedVersion: { type: "number" },
        },
      },
    },
    effect: "write",
    execute: (args) => {
      const requirement = action(
        stringArg(args, "workspaceId"),
        stringArg(args, "requirementId"),
        versionArg(args),
        context.now(),
      );
      return notifyChanged(context, requirement, name);
    },
  });

  return [
    {
      definition: {
        name: "apm.inspectRequirement",
        description: "Inspect one Requirement and its current version.",
        parameters: {
          type: "object",
          required: ["workspaceId", "requirementId"],
          properties: {
            workspaceId: { type: "string" },
            requirementId: { type: "string" },
          },
        },
      },
      effect: "read",
      execute: (args) =>
        service.get(
          stringArg(args, "workspaceId"),
          stringArg(args, "requirementId"),
        ),
    },
    {
      definition: {
        name: "apm.addRequirementEvidence",
        description:
          "Attach evidence to a Requirement using optimistic locking.",
        parameters: {
          type: "object",
          required: [
            "workspaceId",
            "requirementId",
            "expectedVersion",
            "description",
          ],
          properties: {
            workspaceId: { type: "string" },
            requirementId: { type: "string" },
            expectedVersion: { type: "number" },
            description: { type: "string" },
          },
        },
      },
      effect: "write",
      execute: (args) => {
        const requirement = service.addEvidence(
          stringArg(args, "workspaceId"),
          stringArg(args, "requirementId"),
          {
            id: context.createId(),
            description: stringArg(args, "description"),
            createdAt: context.now(),
          },
          versionArg(args),
        );
        return notifyChanged(context, requirement, "addRequirementEvidence");
      },
    },
    transition(
      "confirmRequirement",
      "Confirm a Requirement after clarification.",
      (workspace, id, version, now) =>
        service.confirm(workspace, id, version, now),
    ),
    transition(
      "startRequirement",
      "Start a confirmed Requirement.",
      (workspace, id, version, now) =>
        service.start(workspace, id, version, now),
    ),
    transition(
      "requestRequirementReview",
      "Move a Requirement with evidence into review.",
      (workspace, id, version, now) =>
        service.requestReview(workspace, id, version, now),
    ),
    transition(
      "requestRequirementRework",
      "Send a Requirement back for rework.",
      (workspace, id, version, now) =>
        service.requestRework(workspace, id, version, now),
    ),
    {
      definition: {
        name: "apm.approveRequirementReview",
        description: "Approve a Requirement review and deliver it.",
        parameters: {
          type: "object",
          required: [
            "workspaceId",
            "requirementId",
            "expectedVersion",
            "approvedBy",
          ],
          properties: {
            workspaceId: { type: "string" },
            requirementId: { type: "string" },
            expectedVersion: { type: "number" },
            approvedBy: { type: "string" },
            comment: { type: "string" },
          },
        },
      },
      effect: "write",
      execute: (args) => {
        const requirement = service.approveReview(
          stringArg(args, "workspaceId"),
          stringArg(args, "requirementId"),
          versionArg(args),
          stringArg(args, "approvedBy"),
          context.now(),
          optionalStringArg(args, "comment"),
        );
        return notifyChanged(context, requirement, "approveRequirementReview");
      },
    },
  ];
}

function notifyChanged(
  context: RequirementToolContext,
  requirement: Requirement,
  action: string,
): Requirement | Promise<Requirement> {
  const result = context.onChanged?.(requirement, action);
  return result && typeof result.then === "function"
    ? result.then(() => requirement)
    : requirement;
}

function stringArg(
  args: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${name} must be a non-empty string`);
  return value;
}

function versionArg(args: Readonly<Record<string, unknown>>): number {
  const value = args.expectedVersion;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new Error("expectedVersion must be a non-negative integer");
  return value;
}

function optionalStringArg(
  args: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const value = args[name];
  return value === undefined ? undefined : stringArg(args, name);
}
