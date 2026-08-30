import { spawn } from "node:child_process";
import { createServer } from "node:net";

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

async function availablePort(preferred) {
  for (let port = preferred; port < preferred + 20; port += 1) {
    const server = createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "localhost", resolve);
      });
      await new Promise((resolve) => server.close(resolve));
      return port;
    } catch {
      server.close();
    }
  }
  throw new Error(`No available Renderer dev server port near ${preferred}`);
}

async function waitForRenderer(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Renderer dev server did not start on http://localhost:${port}`);
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

const rendererPort = await availablePort(
  Number.parseInt(process.env.FASTMPA_DEV_SERVER_PORT ?? "5173", 10),
);
start(npmCommand, [
  "exec",
  "vite",
  "--config",
  "vite.renderer.config.ts",
  "--host",
  "localhost",
  "--port",
  String(rendererPort),
  "--strictPort",
]);
await waitForRenderer(rendererPort);
const electron = start(npmCommand, ["exec", "electron", "."], {
  VITE_DEV_SERVER_URL: `http://localhost:${rendererPort}`,
  FASTMPA_DEVTOOLS: "1",
});

electron.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
