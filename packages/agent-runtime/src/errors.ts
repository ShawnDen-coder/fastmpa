/** Runtime 执行协调错误。 */
export class RunAlreadyActiveError extends Error {
  /** 已被其他执行流程占用的 Run 标识。 */
  public readonly runId: string;

  public constructor(runId: string) {
    super(`AgentRun is already active: ${runId}`);
    this.name = "RunAlreadyActiveError";
    this.runId = runId;
  }
}

/** Run 当前状态不允许恢复。 */
export class RunNotResumableError extends Error {
  /** 尝试恢复的 Run 标识。 */
  public readonly runId: string;
  /** 恢复请求发生时 Run 的状态。 */
  public readonly status: string;

  public constructor(runId: string, status: string) {
    super(`AgentRun cannot be resumed from status: ${runId} (${status})`);
    this.name = "RunNotResumableError";
    this.runId = runId;
    this.status = status;
  }
}