import type { RunTurnOptions } from "@shawnden-coder/agent-core";

export interface RunExecutionContext {
  readonly runId: string;
  readonly attempt: number;
  readonly agentId?: string;
  readonly workspaceId?: string;
  readonly toolsetKey: string;
}

/** 可持久化的执行依赖标识；值由宿主应用解释，不包含密钥或实例。 */
export interface RunDependencyKeys {
  readonly modelKey: string;
  readonly toolsetKey: string;
}

/** 在 Worker 进程内把持久化标识重建为实际的模型和工具。 */
export interface RunDependencyResolver {
  resolveModel(
    modelKey: string,
  ): RunTurnOptions["model"] | Promise<RunTurnOptions["model"]>;
  resolveTools(
    toolsetKey: string,
    context?: RunExecutionContext,
  ): RunTurnOptions["tools"] | Promise<RunTurnOptions["tools"]>;
}
