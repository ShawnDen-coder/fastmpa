import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createRequirementTools,
  evaluateRequirementIteration,
  evaluateRequirementRules,
  MemoryRequirementRepository,
  RequirementRuleError,
  RequirementService,
  type RequirementSnapshot,
  RequirementVersionConflictError,
  SqliteRequirementRepository,
} from "../src/index.js";

describe("apm", () => {
  const requirement: RequirementSnapshot = {
    id: "r-1",
    title: "Requirement",
    projectId: "7A",
    iterationId: null,
  };

  it("reports a missing iteration", () => {
    expect(
      evaluateRequirementIteration(requirement, {
        projectId: "7A",
        expectedIterationId: "iteration-1",
      }),
    ).toMatchObject({ reason: "missing", currentIterationId: null });
  });

  it("reports an unexpected iteration and ignores another project", () => {
    expect(
      evaluateRequirementIteration(
        { ...requirement, iterationId: "iteration-2" },
        { projectId: "7A", expectedIterationId: "iteration-1" },
      ),
    ).toMatchObject({ reason: "unexpected" });
    expect(
      evaluateRequirementIteration(requirement, {
        projectId: "other",
        expectedIterationId: "iteration-1",
      }),
    ).toBeUndefined();
  });

  it("enforces lifecycle transitions and evidence prerequisites", () => {
    const service = new RequirementService(new MemoryRequirementRepository());
    const created = service.create({
      id: "req-1",
      workspaceId: "workspace-1",
      title: "Deliver feature",
      ownerId: "agent-1",
      cardId: "card-1",
      now: "2026-01-01T00:00:00.000Z",
    });
    const confirmed = service.confirm(
      "workspace-1",
      "req-1",
      created.version,
      "2026-01-01T00:01:00.000Z",
    );
    const started = service.start(
      "workspace-1",
      "req-1",
      confirmed.version,
      "2026-01-01T00:02:00.000Z",
    );
    expect(() =>
      service.requestReview(
        "workspace-1",
        "req-1",
        started.version,
        "2026-01-01T00:03:00.000Z",
      ),
    ).toThrow(RequirementRuleError);
    const withEvidence = service.addEvidence(
      "workspace-1",
      "req-1",
      {
        id: "evidence-1",
        description: "Build artifact",
        createdAt: "2026-01-01T00:03:00.000Z",
      },
      started.version,
    );
    const reviewPending = service.requestReview(
      "workspace-1",
      "req-1",
      withEvidence.version,
      "2026-01-01T00:04:00.000Z",
    );
    const delivered = service.approveReview(
      "workspace-1",
      "req-1",
      reviewPending.version,
      "human-1",
      "2026-01-01T00:05:00.000Z",
    );
    expect(delivered).toMatchObject({
      status: "delivered",
      version: 5,
      review: { approvedBy: "human-1" },
    });
    expect(() =>
      service.requestRework(
        "workspace-1",
        "req-1",
        delivered.version,
        "2026-01-01T00:06:00.000Z",
      ),
    ).toThrow(RequirementRuleError);
  });

  it("isolates workspaces and rejects stale versions", () => {
    const repository = new MemoryRequirementRepository();
    const service = new RequirementService(repository);
    const requirement = service.create({
      id: "req-1",
      workspaceId: "workspace-1",
      title: "Scoped",
      conversationId: "conversation-1",
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(repository.get("workspace-2", "req-1")).toBeUndefined();
    expect(() =>
      service.confirm("workspace-1", "req-1", requirement.version + 1, "now"),
    ).toThrow(RequirementVersionConflictError);
  });

  it("requires Workspace references when a reference port is provided", () => {
    const service = new RequirementService(new MemoryRequirementRepository(), {
      hasCard: (workspaceId, cardId) =>
        workspaceId === "workspace-1" && cardId === "card-1",
      hasConversation: () => false,
    });
    expect(() =>
      service.create({
        id: "req-1",
        workspaceId: "workspace-1",
        title: "Valid",
        cardId: "card-1",
        now: "now",
      }),
    ).not.toThrow();
    expect(() =>
      service.create({
        id: "req-2",
        workspaceId: "workspace-2",
        title: "Invalid",
        cardId: "card-1",
        now: "now",
      }),
    ).toThrow("is not in workspace");
  });

  it("exposes versioned domain actions as APM Tools", async () => {
    const service = new RequirementService(new MemoryRequirementRepository());
    const created = service.create({
      id: "req-1",
      workspaceId: "workspace-1",
      title: "Tool-managed",
      conversationId: "conversation-1",
      now: "2026-01-01T00:00:00.000Z",
    });
    const tools = createRequirementTools(service, {
      now: () => "2026-01-01T00:01:00.000Z",
      createId: () => "evidence-1",
    });
    const confirm = tools.find(
      (tool) => tool.definition.name === "apm.confirmRequirement",
    );
    expect(
      confirm?.execute({
        workspaceId: "workspace-1",
        requirementId: "req-1",
        expectedVersion: created.version,
      }),
    ).toMatchObject({ status: "confirmed", version: 1 });
    const evidence = tools.find(
      (tool) => tool.definition.name === "apm.addRequirementEvidence",
    );
    expect(
      evidence?.execute({
        workspaceId: "workspace-1",
        requirementId: "req-1",
        expectedVersion: 1,
        description: "CI passed",
      }),
    ).toMatchObject({ version: 2, evidence: [{ id: "evidence-1" }] });
  });

  it("persists Requirements across repository instances with optimistic locking", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmpa-apm-"));
    const path = join(directory, "apm.db");
    const firstRepository = new SqliteRequirementRepository(path);
    const secondRepository = new SqliteRequirementRepository(path);
    try {
      const firstService = new RequirementService(firstRepository);
      const secondService = new RequirementService(secondRepository);
      const created = firstService.create({
        id: "req-1",
        workspaceId: "workspace-1",
        title: "Persistent",
        cardId: "card-1",
        now: "2026-01-01T00:00:00.000Z",
      });
      const stale = secondService.get("workspace-1", "req-1");
      expect(stale).toMatchObject({
        title: "Persistent",
        version: 0,
      });
      firstService.confirm(
        "workspace-1",
        "req-1",
        created.version,
        "2026-01-01T00:01:00.000Z",
      );
      expect(() =>
        secondRepository.save(
          { ...stale, status: "confirmed", version: 1 },
          stale.version,
        ),
      ).toThrow(RequirementVersionConflictError);
    } finally {
      firstRepository.close();
      secondRepository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("queries a Workspace deterministically and composes domain rules", () => {
    const repository = new MemoryRequirementRepository();
    const service = new RequirementService(repository);
    for (const [id, ownerId] of [
      ["req-2", "agent-2"],
      ["req-1", "agent-1"],
      ["req-3", "agent-1"],
    ] as const)
      service.create({
        id,
        workspaceId: "workspace-1",
        title: id,
        ownerId,
        cardId: `card-${id}`,
        now: "now",
      });
    expect(
      service
        .list("workspace-1", { ownerId: "agent-1" })
        .map((item) => item.id),
    ).toEqual(["req-1", "req-3"]);
    const report = evaluateRequirementRules(service.list("workspace-1"), [
      {
        id: "must-have-owner",
        evaluate: (item) =>
          item.ownerId
            ? undefined
            : {
                ruleId: "must-have-owner",
                requirementId: item.id,
                message: "owner required",
              },
      },
    ]);
    expect(report).toMatchObject({ inspectedCount: 3, violations: [] });
  });
});
