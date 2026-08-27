import { OpenRouterModel, ToolRegistry, runTurn } from '../dist/index.mjs'

const apiKey = process.env.OPENROUTER_API_KEY
const modelName = process.env.OPENROUTER_MODEL

if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is missing')
}

if (!modelName) {
  throw new Error('OPENROUTER_MODEL is missing')
}

const tools = new ToolRegistry()
tools.register({
  definition: {
    name: 'add',
    description: '计算两个数字的和。需要调用这个工具完成计算。',
    parameters: {
      type: 'object',
      properties: {
        left: { type: 'number', description: '第一个数字' },
        right: { type: 'number', description: '第二个数字' },
      },
      required: ['left', 'right'],
      additionalProperties: false,
    },
  },
  validate(argumentsValue) {
    if (!argumentsValue || typeof argumentsValue !== 'object') {
      throw new Error('arguments must be an object')
    }

    const args = argumentsValue
    if (!('left' in args) || !('right' in args)) {
      throw new Error('left and right are required')
    }

    if (typeof args.left !== 'number' || typeof args.right !== 'number') {
      throw new Error('left and right must be numbers')
    }
  },
  execute(argumentsValue) {
    const args = argumentsValue
    return {
      left: args.left,
      right: args.right,
      sum: args.left + args.right,
    }
  },
})

const model = new OpenRouterModel({
  apiKey,
  model: modelName,
})

const result = await runTurn(
  {
    messages: [
      {
        role: 'user',
        content: '请使用 add 工具计算 19 + 23，并根据工具结果给出最终答案。',
      },
    ],
    maxSteps: 5,
  },
  {
    model,
    tools,
  },
)

console.dir(
  {
    model: modelName,
    status: result.status,
    steps: result.steps,
    messages: result.messages,
    events: result.events,
    error: result.error,
  },
  { depth: null },
)

if (result.status !== 'done') {
  process.exitCode = 1
}
