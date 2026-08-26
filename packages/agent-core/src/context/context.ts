import type { Message } from '../types/message'
import type { ToolCall, ToolDefinition, ToolResult } from '../types/tool'
import type { ModelInput } from '../types/turn'

export class TurnContext {
  private readonly history: Message[]

  public constructor(messages: readonly Message[] = []) {
    this.history = [...messages]
  }

  public get messages(): readonly Message[] {
    return this.history
  }

  public addMessage(message: Message): void {
    this.history.push(message)
  }

  public addUserMessage(content: string): void {
    this.addMessage({ role: 'user', content })
  }

  public addAssistantMessage(content: string, toolCalls?: readonly ToolCall[]): void {
    this.addMessage({
      role: 'assistant',
      content,
      ...(toolCalls ? { toolCalls } : {}),
    })
  }

  /**
   * 将结构化工具结果转换为模型可以读取的 tool message。
   * 结构化结果本身仍由 Turn 代码保留，Context 只负责消息历史。
   */
  public addToolResult(result: ToolResult): void {
    const content = result.ok
      ? result.content
      : `[tool_error:${result.error.code}] ${result.error.message}`

    this.addMessage({
      role: 'tool',
      name: result.name,
      toolCallId: result.toolCallId,
      content,
    })
  }

  public toModelInput(tools: readonly ToolDefinition[]): ModelInput {
    return {
      messages: [...this.history],
      tools: [...tools],
    }
  }
}

