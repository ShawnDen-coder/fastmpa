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
