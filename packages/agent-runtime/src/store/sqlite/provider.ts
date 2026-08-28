import type { StoreProvider } from "../provider";
import type { SqliteStoreConfig } from "./config";
import { SqliteRunStore } from "./sqlite-run-store";

/** SQLite Store Provider：根据配置创建 SQLite 实现。 */
export class SqliteStoreProvider
  implements StoreProvider<SqliteStoreConfig, SqliteRunStore>
{
  public readonly name = "sqlite";
  public create(config: SqliteStoreConfig): Promise<SqliteRunStore> {
    return SqliteRunStore.open(config);
  }
}
