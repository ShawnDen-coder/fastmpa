import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(import.meta.dirname, "..", "..", "src");

async function source(relativePath: string): Promise<string> {
  return readFile(join(sourceRoot, relativePath), "utf8");
}

describe("Desktop layer boundaries", () => {
  it("keeps Renderer and Preload independent from Application implementation", async () => {
    const files = [
      "preload/preload.ts",
      "renderer/main.tsx",
      "renderer/app/desktop-shell.tsx",
      "renderer/app/page-view.tsx",
      "renderer/stores/index.ts",
      "shared/desktop-api.ts",
      "shared/ipc/index.ts",
    ];
    const contents = await Promise.all(files.map(source));
    expect(
      contents.some((content) => content.includes("application/application")),
    ).toBe(false);
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
});
