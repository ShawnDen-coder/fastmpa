import type {
  ToolRegistry as CoreToolRegistry,
  ModelAdapter,
} from "@shawnden-coder/agent-core";
import type { RunDependencyResolver } from "@shawnden-coder/agent-runtime";
import {
  createTapdReadonlyTools,
  createTapdWriteTools,
  type TapdReadonlyClient,
  type TapdWriteClient,
} from "integrations";
import {
  ToolRegistry as PipelineToolRegistry,
  SqliteApprovalStore,
  ToolPipeline,
  type ToolPolicy,
  toCoreToolRegistry,
} from "tool-pipeline";

export interface RuntimeResolverOptions {
  readonly models: Readonly<Record<string, ModelAdapter>>;
  readonly toolsets: Readonly<Record<string, CoreToolRegistry>>;
}

/** 将持久化依赖键解析为当前 Worker 内的 Model 和 Core ToolRegistry。 */
export class MapRuntimeDependencyResolver implements RunDependencyResolver {
  public constructor(private readonly options: RuntimeResolverOptions) {}

  public resolveModel(modelKey: string): ModelAdapter {
    const model = this.options.models[modelKey];
    if (!model) throw new Error(`Model dependency not found: ${modelKey}`);
    return model;
  }

  public resolveTools(toolsetKey: string): CoreToolRegistry {
    const tools = this.options.toolsets[toolsetKey];
    if (!tools) throw new Error(`Toolset dependency not found: ${toolsetKey}`);
    return tools;
  }
}

/** TAPD Agent 的默认 Core Toolset；只暴露审计，不暴露任何写入动作。 */
export function createTapdReadonlyToolset(
  client: TapdReadonlyClient,
): CoreToolRegistry {
  return toCoreToolRegistry(createTapdReadonlyTools(client));
}

/** TAPD Agent 的受控 Toolset；写入 Tool 只有在显式注入 Pipeline 后才会暴露。 */
export function createTapdToolset(
  client: TapdWriteClient,
  options: {
    pipeline: ToolPipeline;
    actorId: string;
    idempotencyKeyPrefix?: string;
  },
): CoreToolRegistry {
  const registry = new PipelineToolRegistry();
  for (const tool of [
    ...createTapdReadonlyTools(client),
    ...createTapdWriteTools(client),
  ])
    registry.register(tool);
  return toCoreToolRegistry(registry.list(), options);
}

export interface PersistentTapdToolset {
  readonly pipeline: ToolPipeline;
  readonly toolset: CoreToolRegistry;
  readonly approvalStore: SqliteApprovalStore;
}

/** FastMPA 的标准 TAPD 装配：审批记录与 Runtime 使用同一个 SQLite 文件。 */
export function createPersistentTapdToolset(
  client: TapdWriteClient,
  options: {
    databasePath: string;
    actorId: string;
    createId?: () => string;
    policy?: ToolPolicy;
    idempotencyKeyPrefix?: string;
  },
): PersistentTapdToolset {
  const approvalStore = new SqliteApprovalStore(options.databasePath);
  const registry = new PipelineToolRegistry();
  for (const tool of [
    ...createTapdReadonlyTools(client),
    ...createTapdWriteTools(client),
  ])
    registry.register(tool);
  const pipeline = new ToolPipeline(
    registry,
    options.policy,
    options.createId,
    approvalStore,
  );
  return {
    pipeline,
    approvalStore,
    toolset: toCoreToolRegistry(registry.list(), {
      pipeline,
      actorId: options.actorId,
      idempotencyKeyPrefix: options.idempotencyKeyPrefix,
    }),
  };
}
