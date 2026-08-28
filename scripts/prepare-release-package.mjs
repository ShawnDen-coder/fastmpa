import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const tag = process.argv[2];
if (!tag) throw new Error("A package tag is required");
const outputDirectory = process.argv[3] ?? ".";

const packageDirectories = await readdir("packages", { withFileTypes: true });
const packages = [];

for (const entry of packageDirectories) {
  if (!entry.isDirectory()) continue;
  const directory = join("packages", entry.name);
  const manifestPath = join(directory, "package.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    packages.push({ directory, manifest });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const target = packages.find(({ manifest }) => {
  const shortName = manifest.name.split("/").at(-1);
  return `${shortName}-${manifest.version}` === tag;
});

if (!target) throw new Error(`No workspace package matches tag ${tag}`);
if (target.manifest.private === true)
  throw new Error(`Package ${target.manifest.name} is private`);

const versions = new Map(
  packages.map(({ manifest }) => [manifest.name, manifest.version]),
);
const manifest = structuredClone(target.manifest);

for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
  const dependencies = manifest[field];
  if (!dependencies) continue;
  for (const [name, range] of Object.entries(dependencies)) {
    if (typeof range !== "string" || !range.startsWith("workspace:")) continue;
    const version = versions.get(name);
    if (!version) throw new Error(`Unknown workspace dependency ${name}`);
    const selector = range.slice("workspace:".length);
    dependencies[name] =
      selector === "^"
        ? `^${version}`
        : selector === "~"
          ? `~${version}`
          : selector === "*"
            ? version
            : selector;
  }
}

await mkdir(outputDirectory, { recursive: true });
await cp(join(target.directory, "dist"), join(outputDirectory, "dist"), {
  recursive: true,
});
await writeFile(
  join(outputDirectory, "package.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Prepared ${manifest.name}@${manifest.version} from ${tag}`);
