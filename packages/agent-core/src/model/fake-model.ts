import type { ModelInput } from '../types/turn'
import type { ModelAdapter, ModelResponse } from './adapter'

/**
 * FakeModel 可以按预设脚本返回结果。
 *
 * 它不访问网络、不消耗 Token，专门用于 Turn 的确定性测试。
 * 将 Error 放入脚本可以模拟模型请求失败。
 */
export type FakeModelStep = ModelResponse | Error

export class FakeModel implements ModelAdapter {
  private readonly steps: FakeModelStep[]
  private readonly recordedInputs: ModelInput[] = []

  public constructor(steps: readonly FakeModelStep[]) {
    this.steps = [...steps]
  }

  /** 所有已经发给 FakeModel 的请求，供测试断言上下文是否正确。 */
  public get requests(): readonly ModelInput[] {
    return this.recordedInputs
  }

  public async complete(input: ModelInput): Promise<ModelResponse> {
    this.recordedInputs.push(input)

    const step = this.steps.shift()
    if (!step) {
      throw new Error('FakeModel has no remaining scripted response')
    }

    if (step instanceof Error) {
      throw step
    }

    return step
  }
}

