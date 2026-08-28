PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_runtime_events` (
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`data_json` text,
	PRIMARY KEY(`run_id`, `sequence`),
	FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_runtime_events`("run_id", "sequence", "type", "occurred_at", "data_json") SELECT "run_id", "sequence", "type", "occurred_at", "data_json" FROM `runtime_events`;--> statement-breakpoint
DROP TABLE `runtime_events`;--> statement-breakpoint
ALTER TABLE `__new_runtime_events` RENAME TO `runtime_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;