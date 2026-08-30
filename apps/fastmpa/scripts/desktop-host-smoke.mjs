import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const appRoot = new URL("../", import.meta.url).pathname.replace(/^\//, "").replaceAll("/", "\\");
const manifest = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
const requiredFiles = ["dist/main/main.mjs", "dist/preload/preload.mjs", "dist/renderer/index.html"];

if (manifest.main !== "dist/main/main.mjs") throw new Error(`Unexpected Electron entry: ${manifest.main}`);
for (const file of requiredFiles) await access(join(appRoot, file));
console.log(`Desktop host smoke passed: ${requiredFiles.length} packaged entry files present`);
