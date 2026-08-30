import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const appRoot = new URL("../", import.meta.url).pathname.replace(/^\//, "").replaceAll("/", "\\");
const manifest = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
const requiredFiles = [
  "dist/main/main.mjs",
  "dist/preload/preload.cjs",
  "dist/renderer/index.html",
  "resources/icon.ico",
];
const mainSource = await readFile(join(appRoot, "src/main/main.ts"), "utf8");
const mainBundle = await readFile(join(appRoot, "dist/main/main.mjs"), "utf8");
const preloadBundle = await readFile(join(appRoot, "dist/preload/preload.cjs"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`Desktop host smoke failed: ${message}`);
}

assert(manifest.main === "dist/main/main.mjs", `Unexpected Electron entry: ${manifest.main}`);
assert(
  manifest.build?.win?.target?.some(
    (target) => target.target === "nsis" && target.arch?.includes("x64"),
  ),
  "Windows x64 NSIS target is missing",
);
assert(manifest.build.npmRebuild === true, "native dependency rebuild is disabled");
assert(manifest.build.icon === "resources/icon.ico", "Windows icon is missing");
assert(
  manifest.build.asarUnpack?.includes("**/node_modules/better-sqlite3/**/*"),
  "better-sqlite3 is not unpacked from asar",
);
assert(manifest.build.files?.includes("resources/**/*"), "resources are not packaged");
for (const file of requiredFiles) await access(join(appRoot, file));
assert(mainSource.includes('contextIsolation: true'), "context isolation is disabled");
assert(mainSource.includes('nodeIntegration: false'), "node integration is enabled");
assert(mainSource.includes('sandbox: true'), "renderer sandbox is disabled");
assert(mainSource.includes('protocol.handle("app"'), "app protocol handler is missing");
assert(mainBundle.includes("app://fastmpa/index.html"), "production app URL is missing");
assert(preloadBundle.includes("contextBridge"), "preload bridge is missing");
console.log(`Desktop host smoke passed: ${requiredFiles.length} packaged entry files present`);
