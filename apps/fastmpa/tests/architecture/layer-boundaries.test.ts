import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(import.meta.dirname, "..", "..", "src");

async function source(relativePath: string): Promise<string> {
  return readFile(join(sourceRoot, relativePath), "utf8");
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    }),
  );
  return nested.flat();
}

describe("Desktop layer boundaries", () => {
  it("keeps Renderer and Preload independent from Application implementation", async () => {
    const files = (
      await Promise.all([
        filesUnder(join(sourceRoot, "renderer")),
        filesUnder(join(sourceRoot, "preload")),
      ])
    )
      .flat()
      .filter((path) => /\.(ts|tsx)$/.test(path));
    const contents = await Promise.all(
      files.map((path) => readFile(path, "utf8")),
    );
    expect(
      contents.some((content) => content.includes("application/application")),
    ).toBe(false);
    const combined = contents.join("\n");
    expect(combined).not.toContain("ApplicationSnapshot");
    expect(combined).not.toMatch(/\bgetSnapshot\s*\(/);
    expect(combined).not.toMatch(/\bonSnapshot\s*\(/);
  });

  it("keeps Application assembly in Main-owned source", async () => {
    const main = await source("main/main.ts");
    expect(main).toContain("application/bootstrap.js");
    expect(main).toContain("application/application.js");
  });

  it("keeps the renderer entry responsible only for mounting React", async () => {
    const entry = await source("renderer/main.tsx");
    expect(entry).toContain("createRoot");
    expect(entry).toContain("DesktopShell");
    expect(entry).not.toContain("useEffect");
    expect(entry).not.toContain("application.dispatch");
  });

  it("keeps the Tailwind entry limited to tokens and browser-wide rules", async () => {
    const tailwind = await source("renderer/styles/tailwind.css");
    expect(tailwind).not.toContain(".app-shell");
    expect(tailwind).not.toContain(".conversation-item");
    expect(tailwind).toContain("@theme");
    expect(tailwind).toContain("-webkit-app-region");
  });

  it("keeps tests inside the Desktop workspace test tree", async () => {
    const repositoryRoot = join(sourceRoot, "..", "..", "..");
    const candidates = await Promise.all([
      filesUnder(join(repositoryRoot, "tests")).catch(() => []),
      filesUnder(join(repositoryRoot, "src")).catch(() => []),
    ]);
    expect(
      candidates.flat().filter((path) => path.endsWith(".test.ts")),
    ).toEqual([]);
  });
});
