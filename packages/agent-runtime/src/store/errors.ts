/**
 * Runtime Store 错误总览：
 *
 * - RunStoreError：所有 Store 错误的基础类型，适合上层统一捕获；
 * - DuplicateRunError：创建 Run 时使用了已经存在的 runId；
 * - RunNotFoundError：查询、更新 Run 或追加事件时找不到目标 Run；
 * - RunVersionConflictError：并发更新时，调用方使用的版本已过期，
 *   或者提交的新版本号不是当前版本加 1；
 * - EventSequenceError：追加事件时 sequence 重复或倒退，无法保持事件顺序。
 *
 * 这些错误主要出现在内存 Store 的数据完整性检查中。未来替换为数据库
 * Store 时，应保留相同的错误语义，让 Runtime 不依赖具体存储实现。
 */

/** RunStore 的基础错误类型，便于调用方统一捕获存储层异常。 */
export class RunStoreError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RunStoreError";
  }
}

/** 创建 Run 时发现相同 runId 已存在。 */
export class DuplicateRunError extends RunStoreError {
  /** 当前错误涉及的 Run 标识。 */
  public readonly runId: string;
  public constructor(runId: string) {
    super(`AgentRun already exists: ${runId}`);
    this.name = "DuplicateRunError";
    this.runId = runId;
  }
}

/** 查询、更新或追加事件时找不到目标 Run。 */
export class RunNotFoundError extends RunStoreError {
  /** 当前错误涉及的 Run 标识。 */
  public readonly runId: string;
  public constructor(runId: string) {
    super(`AgentRun not found: ${runId}`);
    this.name = "RunNotFoundError";
    this.runId = runId;
  }
}

/** 乐观锁版本冲突，表示当前数据已经被其他调用方更新。 */
export class RunVersionConflictError extends RunStoreError {
  /** 当前错误涉及的 Run 标识。 */
  public readonly runId: string;
  /** 调用方基于的旧版本。 */
  public readonly expectedVersion: number;
  /** Store 中当前真实版本。 */
  public readonly actualVersion: number;
  public constructor(
    runId: string,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `AgentRun version conflict: ${runId} expected ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = "RunVersionConflictError";
    this.runId = runId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/** 事件序号重复或倒退，表示事件无法保持可靠的时间顺序。 */
export class EventSequenceError extends RunStoreError {
  /** 当前错误涉及的 Run 标识。 */
  public readonly runId: string;
  /** 本次尝试追加的事件序号。 */
  public readonly sequence: number;
  /** Store 中已经保存的最后一个事件序号。 */
  public readonly lastSequence: number;
  public constructor(runId: string, sequence: number, lastSequence: number) {
    super(
      `RuntimeEvent sequence must increase for ${runId}: ${sequence} after ${lastSequence}`,
    );
    this.name = "EventSequenceError";
    this.runId = runId;
    this.sequence = sequence;
    this.lastSequence = lastSequence;
  }
}
