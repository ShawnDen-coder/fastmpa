import * as nodeProcess from "node:process";
import { render } from "ink";
import React from "react";
import { bootstrap } from "./bootstrap.js";
import { createProgram } from "./program.js";
import { FastMpaTui } from "./tui/app.js";

// 让直接执行 dist CLI 时也能使用仓库根目录的本地 .env 配置。
try {
  nodeProcess.loadEnvFile?.();
} catch (error) {
  // .env 是可选配置；文件不存在时继续使用系统环境变量和默认值。
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
    throw error;
}

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
