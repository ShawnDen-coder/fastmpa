import { describe, expect, it } from 'vitest'

import { OpenRouterModel } from '../src/index'

const modelInput = {
  messages: [{ role: 'user' as const, content: 'hello' }],
  tools: [],
}

function httpResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body)
    },
  }
}

describe('OpenRouterModel', () => {
  it.each([
    { status: 401, code: 'authentication_failed', retryable: false },
    { status: 429, code: 'rate_limited', retryable: true },
    { status: 503, code: 'request_failed', retryable: true },
  ] as const)('将 HTTP $status 转换为 $code', async ({ status, code, retryable }) => {
    const model = new OpenRouterModel({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher: async () => httpResponse(status, 'provider error'),
    })

    await expect(model.complete(modelInput)).rejects.toMatchObject({
      name: 'ModelExecutionError',
      code,
      retryable,
      status,
    })
  })

  it('拒绝格式不完整的工具调用', async () => {
    const model = new OpenRouterModel({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher: async () =>
        httpResponse(200, {
          choices: [
            {
              message: {
                content: '',
                tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'echo' } }],
              },
            },
          ],
        }),
    })

    await expect(model.complete(modelInput)).rejects.toMatchObject({
      code: 'invalid_response',
      retryable: false,
    })
  })

  it('把取消信号传给 fetcher 并返回 cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    let receivedSignal: unknown
    const model = new OpenRouterModel({
      apiKey: 'test-key',
      model: 'test-model',
      fetcher: async (_url, init) => {
        receivedSignal = init.signal
        throw new Error('aborted')
      },
    })

    await expect(model.complete(modelInput, { signal: controller.signal })).rejects.toMatchObject({
      code: 'cancelled',
      retryable: false,
    })
    expect(receivedSignal).toBe(controller.signal)
  })
})
