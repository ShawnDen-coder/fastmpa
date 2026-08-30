import { render } from "ink";
import React from "react";
import { bootstrap } from "./bootstrap.js";
import { createProgram } from "./program.js";
import { FastMpaTui } from "./tui/app.js";

const program = createProgram();
if (process.argv.length <= 2) {
  const app = await bootstrap({
    databasePath: process.env.FASTMPA_DB ?? "fastmpa.sqlite",
  });
  try {
    await app.start();
    const ui = render(React.createElement(FastMpaTui, { application: app }));
    await ui.waitUntilExit();
  } finally {
    await app.stop();
  }
} else await program.parseAsync();

export * from "./application.js";
export * from "./bootstrap.js";
export * from "./orchestrator.js";
