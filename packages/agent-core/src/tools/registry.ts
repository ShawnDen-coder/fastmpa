import type { ToolDefinition } from '../types/tool'
import type { CancellationSignal } from '../types/turn'

export interface ToolExecutionContext {
  readonly signal?: CancellationSignal
}

export interface ToolImplementation {
  /** 暴露给模型看的名称、描述和参数 schema。 */
  readonly definition: ToolDefinition
  /** 执行前必须进行运行时校验；校验失败应抛出 Error。 */
  readonly validate: (
    argumentsValue: unknown,
    context: ToolExecutionContext,
  ) => void | Promise<void>
  /** 真正执行工具的函数。 */
  readonly execute: (
    argumentsValue: unknown,
    context: ToolExecutionContext,
  ) => unknown | Promise<unknown>
}

/**
 * 内存工具注册表。
 *
 * Registry 只负责管理工具，不执行工具，也不把 execute 函数暴露给模型。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolImplementation>()

  public register(tool: ToolImplementation): void {
    const name = tool.definition.name.trim()
    if (!name) {
      throw new Error('Tool name is required')
    }

    if (name !== tool.definition.name) {
      throw new Error('Tool name must not have leading or trailing whitespace')
    }

    if (typeof tool.validate !== 'function') {
      throw new Error(`Tool validator is required: ${name}`)
    }

    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`)
    }

    this.tools.set(name, tool)
  }

  public get(name: string): ToolImplementation | undefined {
    return this.tools.get(name)
  }

  /** 只返回可安全发送给模型的工具定义。 */
  public definitions(): readonly ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition)
  }
}
