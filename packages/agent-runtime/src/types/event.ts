/** AgentRun 执行期间产生的 JSON-friendly 观测事件。 */
export interface RuntimeEvent {
  /** 事件所属的 Run ID，必须对应一个已存在的 AgentRun。 */
  readonly runId: string;
  /** 同一个 Run 内单调递增的事件序号，从 0 开始。 */
  readonly sequence: number;
  /** 事件类型，例如 run_started、turn_finished、run_failed。 */
  readonly type: string;
  /** 事件发生时间，使用 ISO 8601 字符串。 */
  readonly occurredAt: string;
  /** 事件附加数据；必须保持 JSON-friendly，不能放 Error 或数据库对象。 */
  readonly data?: Readonly<Record<string, unknown>>;
}
