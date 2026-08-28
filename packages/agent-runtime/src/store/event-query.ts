import type { RuntimeEvent } from "../types/index.js";

/** 事件列表查询选项；未设置的字段不参与过滤。 */
export interface ListEventsOptions {
  /** 只返回指定类型的事件。 */
  readonly type?: string;
  /** 只返回 sequence 大于该值的事件。 */
  readonly afterSequence?: number;
  /** 最多返回多少条事件。 */
  readonly limit?: number;
}

/** 校验查询选项，避免不同 Store 对非法参数产生不同结果。 */
export function validateListEventsOptions(
  options: ListEventsOptions = {},
): void {
  if (
    options.afterSequence !== undefined &&
    !Number.isInteger(options.afterSequence)
  )
    throw new RangeError("afterSequence must be an integer");
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit <= 0)
  )
    throw new RangeError("limit must be a positive integer");
}

/** 内存和 JSON Store 使用的统一事件过滤逻辑。 */
export function filterEvents(
  events: readonly RuntimeEvent[],
  options: ListEventsOptions = {},
): readonly RuntimeEvent[] {
  validateListEventsOptions(options);
  const filtered = events.filter((event) => {
    if (options.type !== undefined && event.type !== options.type) return false;
    return (
      options.afterSequence === undefined ||
      event.sequence > options.afterSequence
    );
  });
  return options.limit === undefined
    ? filtered
    : filtered.slice(0, options.limit);
}
