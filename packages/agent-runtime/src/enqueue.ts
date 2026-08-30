import { createHash } from "node:crypto";
import type { RunStore } from "./store/index.js";
import type { AgentRun, EnqueueRunInput } from "./types/index.js";

export type EnqueueResult = {
  readonly run: AgentRun;
  readonly created: boolean;
};

/** 以业务来源生成稳定 Run ID；重复提交返回 existing，不创建第二次 Run。 */
export function deterministicRunId(
  input: Pick<EnqueueRunInput, "runId"> | { readonly sourceKey: string },
): string {
  if ("runId" in input) return input.runId;
  return `run-${createHash("sha256").update(input.sourceKey).digest("hex").slice(0, 24)}`;
}

export async function enqueueIdempotent(
  store: RunStore,
  run: AgentRun,
  event: Parameters<RunStore["createWithEvent"]>[1],
): Promise<EnqueueResult> {
  const existing = await store.get(run.runId);
  if (existing) return { run: existing, created: false };
  await store.createWithEvent(run, event);
  return { run, created: true };
}
