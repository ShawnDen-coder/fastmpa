import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const appRoot = new URL("../", import.meta.url).pathname
  .replace(/^\//, "")
  .replaceAll("/", "\\");
const outputDirectory = process.env.FASTMPA_PACKAGE_OUTPUT ?? "release";
const packagedRoot = join(appRoot, outputDirectory, "win-unpacked");
const resourcesRoot = join(packagedRoot, "resources");
const asarPath = join(resourcesRoot, "app.asar");
const unpackedRoot = join(resourcesRoot, "app.asar.unpacked");
const manifest = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`Desktop package smoke failed: ${message}`);
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

await access(
  join(appRoot, outputDirectory, `FastMPA-Setup-${manifest.version}.exe`),
);
await access(asarPath);
const unpackedFiles = await files(unpackedRoot);
assert(
  unpackedFiles.some((file) => /prebuilds[\\/]win32-x64\.node$/i.test(file)),
  "Electron-native better-sqlite3 binary is missing",
);
assert(
  !unpackedFiles.some((file) => file.includes("dist\\win-unpacked")),
  "stale unpacked build output was included recursively",
);
const asarText = (await readFile(asarPath)).toString("utf8");
assert(asarText.includes("migrations"), "runtime migrations are missing from app.asar");
console.log("Desktop package smoke passed: NSIS, native SQLite and migrations present");
