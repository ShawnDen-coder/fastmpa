import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { SqliteStoreConfig } from "./config.js";
import { agentRuns, runtimeEvents } from "./schema.js";

export interface SqliteDatabase {
  readonly client: Database.Database;
  readonly db: ReturnType<typeof drizzle>;
}

/** 创建 better-sqlite3 连接，并执行 Drizzle migrations。 */
export async function openSqliteDatabase(
  config: SqliteStoreConfig,
): Promise<SqliteDatabase> {
  if (config.filePath !== ":memory:")
    await mkdir(dirname(config.filePath), { recursive: true });

  const client = new Database(config.filePath);
  client.pragma("foreign_keys = ON");

  const db = drizzle(client, { schema: { agentRuns, runtimeEvents } });
  const migrationsFolder =
    config.migrationsFolder === false
      ? undefined
      : (config.migrationsFolder ?? resolveMigrationsFolder());
  if (migrationsFolder) {
    await migrate(db, { migrationsFolder });
  } else {
    // CommonJS bundles cannot reliably resolve import.meta.url. Keep the
    // bundled Host usable with an idempotent schema fallback.
    client.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        run_id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        input_json TEXT,
        attempt INTEGER NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        result_json TEXT,
        error_json TEXT,
        owner_id TEXT,
        lease_until TEXT,
        heartbeat_at TEXT
      );
      CREATE TABLE IF NOT EXISTS runtime_events (
        run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        data_json TEXT,
        PRIMARY KEY (run_id, sequence),
        FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE
      );
    `);
  }

  return { client, db };
}

function resolveMigrationsFolder(): string | undefined {
  try {
    return fileURLToPath(new URL("./migrations", import.meta.url));
  } catch {
    return undefined;
  }
}
