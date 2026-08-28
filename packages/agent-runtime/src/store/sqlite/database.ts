import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { SqliteStoreConfig } from "./config";
import { agentRuns, runtimeEvents } from "./schema";

export interface SqliteDatabase {
  readonly client: Database.Database;
  readonly db: ReturnType<typeof drizzle>;
}

/** 创建 better-sqlite3 连接，并由 Drizzle 初始化表结构。 */
export async function openSqliteDatabase(config: SqliteStoreConfig): Promise<SqliteDatabase> {
  if (config.filePath !== ":memory:") await mkdir(dirname(config.filePath), { recursive: true });
  const client = new Database(config.filePath);
  client.pragma("foreign_keys = ON");
  client.exec(`CREATE TABLE IF NOT EXISTS agent_runs (run_id TEXT PRIMARY KEY, status TEXT NOT NULL, attempt INTEGER NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT) STRICT; CREATE TABLE IF NOT EXISTS runtime_events (run_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL, occurred_at TEXT NOT NULL, data_json TEXT, PRIMARY KEY (run_id, sequence), FOREIGN KEY (run_id) REFERENCES agent_runs(run_id)) STRICT;`);
  return { client, db: drizzle(client, { schema: { agentRuns, runtimeEvents } }) };
}
