import type { CancellationSignal, TurnStatus } from '../types/turn'

/** Guard 检查时需要的最小运行上下文。 */
export interface GuardContext {
  readonly step: number
  readonly maxSteps: number
  readonly signal?: CancellationSignal
}

export type GuardResult =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly status: TurnStatus
      readonly error?: Error
    }

/** Guard 只判断 Turn 能否继续，不执行模型、工具或业务逻辑。 */
export interface TurnGuard {
  check(context: GuardContext): GuardResult
}

/** 按顺序执行 Guard，第一个拒绝继续的结果优先。 */
export function checkGuards(guards: readonly TurnGuard[], context: GuardContext): GuardResult {
  for (const guard of guards) {
    const result = guard.check(context)
    if (!result.allowed) return result
  }

  return { allowed: true }
}
