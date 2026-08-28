import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqliteStoreConfig } from "./config";

/** 打开 SQLite 连接并初始化当前版本的表。 */
export async function openSqliteDatabase(
  config: SqliteStoreConfig,
): Promise<DatabaseSync> {
  if (config.filePath !== ":memory:")
    await mkdir(dirname(config.filePath), { recursive: true });
  const database = new DatabaseSync(config.filePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(
    `CREATE TABLE IF NOT EXISTS agent_runs (run_id TEXT PRIMARY KEY, status TEXT NOT NULL, attempt INTEGER NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT) STRICT; CREATE TABLE IF NOT EXISTS runtime_events (run_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL, occurred_at TEXT NOT NULL, data_json TEXT, PRIMARY KEY (run_id, sequence), FOREIGN KEY (run_id) REFERENCES agent_runs(run_id)) STRICT;`,
  );
  return database;
}
