import { readFile } from "node:fs/promises";
import type { TapdReadonlyClient, TapdRequirement } from "integrations";

export async function loadTapdFixture(
  path: string | URL,
): Promise<TapdReadonlyClient> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const requirements = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.requirements)
      ? parsed.requirements
      : undefined;
  if (!requirements?.every(isRequirement)) {
    throw new Error("TAPD fixture must be an array or { requirements: [] }");
  }
  return {
    listRequirements: async ({ page, pageSize }) => {
      if (page < 1) throw new Error("page must be positive");
      const start = (page - 1) * pageSize;
      const items = requirements.slice(start, start + pageSize);
      return {
        items,
        ...(start + pageSize < requirements.length
          ? { nextPage: page + 1 }
          : {}),
      };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequirement(value: unknown): value is TapdRequirement {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.projectId === "string" &&
    (value.iteration === undefined ||
      value.iteration === null ||
      typeof value.iteration === "string")
  );
}
