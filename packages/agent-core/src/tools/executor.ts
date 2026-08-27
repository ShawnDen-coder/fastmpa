import type { ToolCall, ToolError, ToolResult } from '../types/tool'
import type { ToolRegistry } from './registry'
import { ToolExecutionError } from './errors'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function serializeResult(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === undefined) {
    return ''
  }

  const serialized = JSON.stringify(value)
  return serialized === undefined ? String(value) : serialized
}

function toToolError(
  error: unknown,
  fallbackCode: ToolError['code'],
  fallbackRetryable = false,
): ToolError {
  if (error instanceof ToolExecutionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details === undefined ? {} : { details: error.details }),
    }
  }

  return {
    code: fallbackCode,
    message: errorMessage(error),
    retryable: fallbackRetryable,
  }
}

function failedResult(call: ToolCall, error: ToolError): ToolResult {
  return {
    ok: false,
    toolCallId: call.id,
    name: call.name,
    content: error.message,
    error,
  }
}

/**
 * 将模型的 ToolCall 转换成安全、统一的 ToolResult。
 *
 * 预期的失败会转换成结构化结果交给 Turn；
 * Registry 自身的配置错误仍然直接抛出。
 */
export class ToolExecutor {
  private readonly registry: ToolRegistry

  public constructor(registry: ToolRegistry) {
    this.registry = registry
  }

  public async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.registry.get(call.name)

    if (!tool) {
      return failedResult(call, {
        code: 'tool_not_found',
        message: `Tool is not registered: ${call.name}`,
        retryable: false,
      })
    }

    let argumentsValue: unknown
    try {
      argumentsValue = JSON.parse(call.arguments)
    } catch (error) {
      return failedResult(call, toToolError(error, 'invalid_json'))
    }

    try {
      await tool.validate?.(argumentsValue)
    } catch (error) {
      return failedResult(call, toToolError(error, 'invalid_arguments'))
    }

    try {
      const result = await tool.execute(argumentsValue)
      return {
        ok: true,
        toolCallId: call.id,
        name: call.name,
        content: serializeResult(result),
      }
    } catch (error) {
      return failedResult(call, toToolError(error, 'execution_failed'))
    }
  }
}
