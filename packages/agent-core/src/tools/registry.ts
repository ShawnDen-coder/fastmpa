import type { ToolDefinition } from '../types/tool'

export interface ToolImplementation {
  /** 暴露给模型看的名称、描述和参数 schema。 */
  readonly definition: ToolDefinition
  /** 执行前的业务参数校验；校验失败应抛出 Error。 */
  readonly validate?: (argumentsValue: unknown) => void | Promise<void>
  /** 真正执行工具的函数。 */
  readonly execute: (argumentsValue: unknown) => unknown | Promise<unknown>
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
