import { describe, expect, it } from "vitest";
import { resolveRendererPath } from "../../src/main/renderer-path.js";

describe("resolveRendererPath", () => {
  const root = "C:\\FastMPA\\dist\\renderer";
  it("defaults the root request to index.html", () => {
    expect(resolveRendererPath(root, "/")).toBe(`${root}\\index.html`);
  });
  it("decodes an asset path inside the renderer root", () => {
    expect(resolveRendererPath(root, "/assets/app%20bundle.js")).toBe(
      `${root}\\assets\\app bundle.js`,
    );
  });
  it("rejects traversal and malformed encoding", () => {
    expect(resolveRendererPath(root, "/%2e%2e/main.mjs")).toBeUndefined();
    expect(resolveRendererPath(root, "/%E0%A4%A")).toBeUndefined();
  });
});
