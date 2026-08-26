import type { Message, MessageRole } from '../types/message'
import type { ToolCall, ToolDefinition } from '../types/tool'
import type { ModelInput } from '../types/turn'
import type { ModelAdapter, ModelResponse } from './adapter'

/** OpenRouter 返回结果的最小 HTTP 接口，避免绑定具体 HTTP 库。 */
export interface OpenRouterHttpResponse {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

export interface OpenRouterRequestInit {
  readonly method: 'POST'
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export type OpenRouterFetcher = (
  url: string,
  init: OpenRouterRequestInit,
) => Promise<OpenRouterHttpResponse>

/** OpenRouter 适配器的配置。API Key 只从外部传入，不写入源码。 */
export interface OpenRouterModelOptions {
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly httpReferer?: string
  readonly appTitle?: string
  readonly maxTokens?: number
  readonly fetcher?: OpenRouterFetcher
}

interface OpenRouterMessage {
  readonly role: MessageRole
  readonly content: string
  readonly name?: string
  readonly tool_call_id?: string
  readonly tool_calls?: readonly OpenRouterToolCall[]
}

interface OpenRouterToolCall {
  readonly id: string
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly arguments: string
  }
}

interface OpenRouterResponseBody {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: unknown
      readonly tool_calls?: readonly OpenRouterToolCall[]
    }
  }[]
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

/** 默认使用运行环境提供的 fetch；测试时可以注入假的 fetcher。 */
function defaultFetcher(url: string, init: OpenRouterRequestInit): Promise<OpenRouterHttpResponse> {
  const fetchFunction = (globalThis as { fetch?: OpenRouterFetcher }).fetch
  if (!fetchFunction) {
    throw new Error('Global fetch is unavailable; provide an OpenRouter fetcher')
  }
  return fetchFunction(url, init)
}

/** 将 Agent Core 的 Message 转成 OpenRouter 的消息格式。 */
function toOpenRouterMessage(message: Message): OpenRouterMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.name ? { name: message.name } : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })),
        }
      : {}),
  }
}

/** 将内部工具定义转成 OpenRouter 的 function tool 格式。 */
function toOpenRouterTool(tool: ToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

/** 只接受结构完整的工具调用，避免把异常响应传给 Turn。 */
function isToolCall(value: unknown): value is OpenRouterToolCall {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<OpenRouterToolCall>
  return (
    typeof candidate.id === 'string' &&
    candidate.type === 'function' &&
    !!candidate.function &&
    typeof candidate.function.name === 'string' &&
    typeof candidate.function.arguments === 'string'
  )
}

function readResponseBody(value: unknown): OpenRouterResponseBody {
  if (!value || typeof value !== 'object') {
    throw new Error('OpenRouter returned an invalid JSON body')
  }
  return value as OpenRouterResponseBody
}

/**
 * OpenRouter implementation of ModelAdapter.
 *
 * This adapter performs one non-streaming Chat Completions request.
 * Tool execution remains the responsibility of Turn and ToolExecutor.
 */
export class OpenRouterModel implements ModelAdapter {
  private readonly options: OpenRouterModelOptions
  private readonly fetcher: OpenRouterFetcher

  public constructor(options: OpenRouterModelOptions) {
    if (!options.apiKey.trim()) {
      throw new Error('OpenRouter API key is required')
    }
    if (!options.model.trim()) {
      throw new Error('OpenRouter model is required')
    }

    this.options = options
    this.fetcher = options.fetcher ?? defaultFetcher
  }

  /**
   * 执行一次模型请求：
   * 1. 准备消息和工具；
   * 2. 调用 OpenRouter；
   * 3. 将响应转换成 ModelResponse；
   * 4. 不在这里执行工具，工具由 Turn/ToolExecutor 负责。
   */
  public async complete(input: ModelInput): Promise<ModelResponse> {
    const messages = input.messages.map(toOpenRouterMessage)
    // 请求体仍然使用 OpenAI 风格的 Chat Completions 格式。
    const body = {
      model: this.options.model,
      messages,
      tools: input.tools.map(toOpenRouterTool),
      ...(this.options.maxTokens ? { max_tokens: this.options.maxTokens } : {}),
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      'Content-Type': 'application/json',
    }

    if (this.options.httpReferer) {
      headers['HTTP-Referer'] = this.options.httpReferer
    }
    if (this.options.appTitle) {
      headers['X-Title'] = this.options.appTitle
    }

    const response = await this.fetcher(
      `${this.options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
    )

    // HTTP 错误必须转成明确异常，不能让 Turn 误以为模型正常返回。
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`OpenRouter request failed with HTTP ${response.status}: ${detail.slice(0, 500)}`)
    }

    const parsed = readResponseBody(await response.json())
    const message = parsed.choices?.[0]?.message
    if (!message) {
      throw new Error('OpenRouter response did not contain a choice message')
    }

    // 如果模型返回工具调用，转换后交给 Turn；这里不执行工具。
    const toolCalls = (message.tool_calls ?? []).filter(isToolCall).map(
      (toolCall): ToolCall => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      }),
    )

    if (toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        content: typeof message.content === 'string' ? message.content : '',
        toolCalls,
      }
    }

    if (typeof message.content === 'string') {
      return {
        type: 'text',
        content: message.content,
      }
    }

    throw new Error('OpenRouter response contained neither text nor tool calls')
  }
}



