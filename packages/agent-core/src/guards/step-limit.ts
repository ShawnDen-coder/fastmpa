import { AgentCoreError } from '../errors'
import type { GuardContext, GuardResult, TurnGuard } from './guard'

/** 防止模型和工具之间无限循环的最大步数保护器。 */
export class StepLimitGuard implements TurnGuard {
  public check(context: GuardContext): GuardResult {
    if (context.step < context.maxSteps) return { allowed: true }

    return {
      allowed: false,
      status: 'failed',
      error: new AgentCoreError(
        'step_limit_exceeded',
        `Turn exceeded maximum steps: ${context.maxSteps}`,
      ),
    }
  }
}
