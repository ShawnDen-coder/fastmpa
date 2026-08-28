import type { RunStore } from "./run-store.js";

/**
 * Store Provider 的统一创建协议。
 * TConfig 是具体存储的配置，TStore 默认对外暴露通用 RunStore。
 */
export interface StoreProvider<TConfig, TStore extends RunStore = RunStore> {
  /** Provider 名称，例如 sqlite、memory 或 postgres。 */
  readonly name: string;
  /** 根据配置创建一个 Store 实例。 */
  create(config: TConfig): Promise<TStore>;
}
