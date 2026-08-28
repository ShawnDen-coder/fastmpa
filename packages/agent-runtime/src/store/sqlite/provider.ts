import type { RunStore } from "../run-store";
import { SqliteRunStore } from "./sqlite-run-store";
import type { SqliteStoreConfig } from "./config";

/** SQLite Store Provider：根据配置创建 SQLite 实现。 */
export class SqliteStoreProvider {
  public readonly name = "sqlite";
  public create(config: SqliteStoreConfig): Promise<RunStore> { return SqliteRunStore.open(config); }
}
