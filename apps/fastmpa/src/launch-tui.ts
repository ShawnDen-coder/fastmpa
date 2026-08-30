import { render } from "ink";
import React from "react";
import { bootstrap } from "./bootstrap.js";
import { FastMpaTui } from "./tui/app.js";

export async function launchTui(): Promise<void> {
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
}
