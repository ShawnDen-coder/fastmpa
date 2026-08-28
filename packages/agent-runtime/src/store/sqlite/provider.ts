import type { StoreProvider } from "../provider.js";
import type { SqliteStoreConfig } from "./config.js";
import { SqliteRunStore } from "./sqlite-run-store.js";

/** SQLite Store Provider：根据配置创建 SQLite 实现。 */
export class SqliteStoreProvider
  implements StoreProvider<SqliteStoreConfig, SqliteRunStore>
{
  public readonly name = "sqlite";
  public create(config: SqliteStoreConfig): Promise<SqliteRunStore> {
    return SqliteRunStore.open(config);
  }
}
