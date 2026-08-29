import type { AgentRun, RunStatus } from "../types/index.js";

/** Run 列表查询；cursor 表示上一页最后一个 `(createdAt, runId)`。 */
export interface ListRunsOptions {
  readonly status?: RunStatus;
  readonly limit?: number;
  readonly cursor?: string;
}

/** 稳定排序后的 Run 分页结果。 */
export interface RunPage {
  readonly runs: readonly AgentRun[];
  readonly nextCursor?: string;
}

export function paginateRuns(
  runs: readonly AgentRun[],
  options: ListRunsOptions = {},
): RunPage {
  validateListRunsOptions(options);
  const cursor = options.cursor === undefined ? undefined : decodeCursor(options.cursor);
  const matching = runs
    .filter((run) => options.status === undefined || run.status === options.status)
    .sort(compareRuns)
    .filter((run) => cursor === undefined || compareRunToCursor(run, cursor) > 0);

  if (options.limit === undefined) return { runs: matching };
  const page = matching.slice(0, options.limit);
  const last = page.at(-1);
  return {
    runs: page,
    ...(last !== undefined && matching.length > page.length
      ? { nextCursor: encodeCursor(last) }
      : {}),
  };
}

export function validateListRunsOptions(options: ListRunsOptions = {}): void {
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new RangeError("limit must be a positive integer");
  }
  if (options.cursor !== undefined) decodeCursor(options.cursor);
}

interface RunCursor {
  readonly createdAt: string;
  readonly runId: string;
}

function compareRuns(left: AgentRun, right: AgentRun): number {
  return compareRunToCursor(left, right);
}

function compareRunToCursor(run: AgentRun, cursor: RunCursor): number {
  return (
    run.createdAt.localeCompare(cursor.createdAt) ||
    run.runId.localeCompare(cursor.runId)
  );
}

function encodeCursor(run: AgentRun): string {
  return Buffer.from(
    JSON.stringify({ createdAt: run.createdAt, runId: run.runId }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): RunCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("createdAt" in parsed) ||
      !("runId" in parsed) ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.runId !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    return { createdAt: parsed.createdAt, runId: parsed.runId };
  } catch {
    throw new RangeError("cursor must be a valid Run cursor");
  }
}
