import { createProgram } from "./program.js";

const program = createProgram();

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

export * from "./approval-resumer.js";
export * from "./requirement-reporter.js";
export * from "./runtime-host.js";
export * from "./runtime-resolver.js";
export * from "./tapd-workflow.js";
export * from "./workspace-refs.js";
