import { OpenRouterModel } from '../dist/index.mjs'

const apiKey = process.env.OPENROUTER_API_KEY
const modelName = process.env.OPENROUTER_MODEL

if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is missing')
}

if (!modelName) {
  throw new Error('OPENROUTER_MODEL is missing')
}

const model = new OpenRouterModel({
  apiKey,
  model: modelName,
})

const response = await model.complete({
  messages: [
    {
      role: 'user',
      content: '请只回复：OpenRouter 测试成功',
    },
  ],
  tools: [],
})

console.log({
  model: modelName,
  responseType: response.type,
  content: response.type === 'text' ? response.content : undefined,
  toolCallCount: response.type === 'tool_calls' ? response.toolCalls.length : 0,
})
