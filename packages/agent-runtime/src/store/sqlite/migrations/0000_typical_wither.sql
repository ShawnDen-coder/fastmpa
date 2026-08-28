CREATE TABLE `agent_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `runtime_events` (
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`data_json` text,
	PRIMARY KEY(`run_id`, `sequence`)
);
