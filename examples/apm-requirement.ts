import { evaluateRequirementIteration } from "apm"

console.log(
  evaluateRequirementIteration(
    {
      id: "REQ-002",
      title: "导出报表",
      projectId: "7A",
      iterationId: null,
    },
    { projectId: "7A", expectedIterationId: "Sprint 1" },
  ),
)
