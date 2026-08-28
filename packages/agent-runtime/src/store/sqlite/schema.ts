import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const agentRuns = sqliteTable("agent_runs", {
  runId: text("run_id").primaryKey(),
  status: text("status").notNull(),
  inputJson: text("input_json"),
  attempt: integer("attempt").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  ownerId: text("owner_id"),
  leaseUntil: text("lease_until"),
  heartbeatAt: text("heartbeat_at"),
});

export const runtimeEvents = sqliteTable(
  "runtime_events",
  {
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.runId, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    dataJson: text("data_json"),
  },
  (table) => ({
    runSequence: primaryKey({ columns: [table.runId, table.sequence] }),
  }),
);
