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
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
  });

  return { client, db };
}
