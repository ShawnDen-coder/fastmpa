import * as nodeProcess from "node:process";
import { launchTui } from "./launch-tui.js";
import { createProgram } from "./program.js";

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
  await launchTui();
} else await program.parseAsync();

export * from "./application.js";
export * from "./bootstrap.js";
export * from "./orchestrator.js";
