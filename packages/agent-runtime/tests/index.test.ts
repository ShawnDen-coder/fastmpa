import { describe, expect, it } from "vitest";

describe("agent-runtime", () => {
  it("loads its public entry point", async () => {
    const module = await import("../src/index.js");
    expect(module.RunStatus).toBeUndefined();
    expect(module.canTransition("queued", "running")).toBe(true);
  }, 30_000);
});
