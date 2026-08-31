import { createConnection } from "node:net";
import { request } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = new URL("..", import.meta.url).pathname.replace(/^\//, "");
const executable = join(root, "release", "win-unpacked", "FastMPA.exe");
const port = 9230 + (process.pid % 1000);
let nextId = 1;

if (process.platform !== "win32" || !existsSync(executable)) {
  console.log("Desktop interactive smoke skipped: Windows packaged executable is unavailable");
  process.exit(0);
}

const userData = await mkdtemp(join(root, "interactive-smoke-"));
const child = spawn(executable, [
], {
  detached: false,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    FASTMPA_E2E: "1",
    FASTMPA_E2E_PORT: String(port),
    FASTMPA_E2E_USER_DATA: userData,
  },
});
let childOutput = "";
child.stdout.on("data", (chunk) => { childOutput += chunk.toString(); });
child.stderr.on("data", (chunk) => { childOutput += chunk.toString(); });

try {
  const target = await waitForTarget();
  const socket = await connectWebSocket(new URL(target.webSocketDebuggerUrl));
  try {
    await socket.enableDomains();
    await evaluate(socket, "location.reload()");
    await waitForRenderer(socket);
    const shell = await evaluate(socket, `({
      title: document.title,
      hasTitleBar: Boolean(document.querySelector('.title-bar')),
      hasRail: Boolean(document.querySelector('[aria-label="Primary navigation"]')),
      hasComposer: Boolean(document.querySelector('textarea')),
    })`);
    if (
      shell.title !== "FastMPA" ||
      !shell.hasTitleBar ||
      !shell.hasRail ||
      !shell.hasComposer
    )
      throw new Error(`Unexpected initial renderer state: ${JSON.stringify(shell)}`);

    const agents = await evaluate(socket, `(() => {
      const button = document.querySelector('button[title="Agents"]');
      button?.click();
      return Boolean(button);
    })()`);
    if (!agents) throw new Error("Could not activate Agents rail item");
    await delay(250);
    const page = await evaluate(socket, "document.body.innerText");
    if (!page.includes("WORKSPACE AGENTS") && !page.includes("Add Agent"))
      throw new Error(`Agents page did not render after navigation: ${JSON.stringify(page)}`);
    console.log("Desktop interactive smoke passed: packaged Electron renderer loaded and navigated");
  } finally {
    socket.destroy();
  }
} catch (error) {
  if (error instanceof Error && childOutput)
    error.message += `\nElectron output:\n${childOutput}`;
  throw error;
} finally {
  await terminateChild(child);
  await removeWithRetry(userData);
}

async function waitForRenderer(socket) {
  let last;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    last = await evaluate(socket, `(() => {
      const asset = document.querySelector('script[type="module"]')?.src;
      if (!asset) return Promise.resolve({ error: 'Renderer module URL is missing' });
      return fetch(asset)
      .then(async (response) => ({
        title: document.title,
        ready: document.readyState,
        hasShell: Boolean(document.querySelector('.app-shell')),
        body: document.body?.innerText ?? "",
        html: document.documentElement?.outerHTML ?? "",
        href: location.href,
        assetStatus: response.status,
        assetType: response.headers.get('content-type'),
        assetHead: (await response.text()).slice(0, 80),
        importResult: await import(asset)
          .then(() => ({
            status: 'ok',
            fastMpa: typeof window.fastMpa,
            root: document.getElementById('root')?.innerHTML ?? '',
          }))
          .catch((error) => String(error)),
      }))
      .catch((error) => ({ error: String(error), href: location.href }));
    })()`);
    if (last.title === "FastMPA" && last.hasShell) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for the FastMPA renderer to mount: ${JSON.stringify(last)}; CDP events: ${JSON.stringify(socket.events)}`);
}

async function terminateChild(process) {
  if (process.exitCode === null) process.kill();
  if (process.exitCode === null)
    await Promise.race([
      new Promise((resolve) => process.once("exit", resolve)),
      delay(2_000),
    ]);
  if (process.exitCode === null) {
    try {
      execFileSync("taskkill", ["/PID", String(process.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // The process may have exited between the check and taskkill.
    }
  }
}

async function removeWithRetry(path) {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

function waitForTarget() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20_000;
    const poll = () => {
      getJson(`http://127.0.0.1:${port}/json/list`)
        .then((targets) => {
          const target = targets.find(
            (item) => item.type === "page" && item.url !== "about:blank",
          );
          if (target?.webSocketDebuggerUrl) return resolve(target);
          if (Date.now() >= deadline) return reject(new Error("Timed out waiting for Electron renderer"));
          setTimeout(poll, 200);
        })
        .catch(() => {
          if (Date.now() >= deadline) reject(new Error("Timed out waiting for Electron DevTools endpoint"));
          else setTimeout(poll, 200);
        });
    };
    poll();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(Number(url.port), url.hostname);
    const key = Buffer.from(`${Date.now()}-${Math.random()}`).toString("base64");
    let buffer = Buffer.alloc(0);
    let handshake = false;
    const pending = new Map();
    const events = [];
    socket.on("connect", () => {
      socket.write(
        `GET ${url.pathname}${url.search} HTTP/1.1\r\n` +
        `Host: ${url.host}\r\n` +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshake) {
        const end = buffer.indexOf("\r\n\r\n");
        if (end < 0) return;
        handshake = true;
        buffer = buffer.subarray(end + 4);
        resolve({
          destroy: () => socket.destroy(),
          send(id, expression) {
            sendFrame(socket, JSON.stringify({ id, method: "Runtime.evaluate", params: {
              expression, awaitPromise: true, returnByValue: true,
            }}));
          },
          pending,
          events,
          enable(domain) {
            const id = nextId++;
            return new Promise((resolve, reject) => {
              pending.set(id, (message) => {
                if (message.error) reject(new Error(message.error.message));
                else resolve(message);
              });
              sendFrame(socket, JSON.stringify({
                id,
                method: `${domain}.enable`,
                params: {},
              }));
            });
          },
          enableDomains() {
            return Promise.all([
              this.enable("Runtime"),
              this.enable("Page"),
            ]);
          },
        });
      }
      while (true) {
        const frame = readFrame(buffer);
        if (!frame) break;
        buffer = frame.rest;
        if (frame.opcode !== 1) continue;
        const message = JSON.parse(frame.payload.toString("utf8"));
        if (message.method === "Runtime.exceptionThrown" || message.method === "Runtime.consoleAPICalled")
          events.push(message);
        const callback = pending.get(message.id);
        if (callback) {
          pending.delete(message.id);
          callback(message);
        }
      }
    });
    socket.on("error", reject);
  });
}

function evaluate(socket, expression) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    socket.pending.set(id, (message) => {
      const exception = message.result?.exceptionDetails;
      if (exception) return reject(new Error(exception.text ?? "Renderer evaluation failed"));
      resolve(message.result?.result?.value);
    });
    socket.send(id, expression);
  });
}

function sendFrame(socket, payload) {
  const body = Buffer.from(payload);
  const mask = Buffer.from([0x13, 0x37, 0xc0, 0xde]);
  const masked = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1)
    masked[index] = body[index] ^ mask[index % 4];
  let header;
  if (body.length < 126) header = Buffer.from([0x81, 0x80 | body.length]);
  else if (body.length < 65_536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(body.length, 2);
  } else throw new Error("CDP payload is too large");
  socket.write(Buffer.concat([header, mask, masked]));
}

function readFrame(buffer) {
  if (buffer.length < 2) return undefined;
  const fin = buffer[0] & 0x80;
  const opcode = buffer[0] & 0x0f;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return undefined;
    length = buffer.readUInt16BE(2); offset = 4;
  } else if (length === 127) throw new Error("Unsupported large CDP frame");
  if (!fin || buffer.length < offset + length) return undefined;
  return { opcode, payload: buffer.subarray(offset, offset + length), rest: buffer.subarray(offset + length) };
}
