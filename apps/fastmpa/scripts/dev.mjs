import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: false,
  });
  children.push(child);
  return child;
}

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

async function waitForRenderer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch("http://localhost:5173");
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Renderer dev server did not start on http://localhost:5173");
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

start(npmCommand, [
  "exec",
  "vite",
  "--config",
  "vite.renderer.config.ts",
  "--host",
  "localhost",
  "--strictPort",
]);
await waitForRenderer();
const electron = start(npmCommand, ["exec", "electron", "."], {
  VITE_DEV_SERVER_URL: "http://localhost:5173",
  FASTMPA_DEVTOOLS: "1",
});

electron.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
