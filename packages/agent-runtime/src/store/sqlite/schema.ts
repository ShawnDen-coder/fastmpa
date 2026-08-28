import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const agentRuns = sqliteTable("agent_runs", {
  runId: text("run_id").primaryKey(),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const runtimeEvents = sqliteTable(
  "runtime_events",
  {
    runId: text("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    dataJson: text("data_json"),
  },
  (table) => ({
    runSequence: primaryKey({ columns: [table.runId, table.sequence] }),
  }),
);
