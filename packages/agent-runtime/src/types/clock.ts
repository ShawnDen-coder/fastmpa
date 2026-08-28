/** Runtime 使用的时间来源。 */
export interface Clock {
  /** 返回 ISO 8601 格式的当前时间。 */
  now(): string;
}

/** 默认系统时钟。 */
export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};
