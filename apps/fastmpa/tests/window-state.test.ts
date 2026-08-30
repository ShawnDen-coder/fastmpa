import { describe, expect, it } from "vitest";
import {
  defaultWindowState,
  isWindowStateVisible,
  parseWindowState,
} from "../src/main/window-state.js";

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe("window state", () => {
  it("falls back for malformed persisted state", () => {
    expect(parseWindowState("not-json")).toEqual(defaultWindowState);
    expect(parseWindowState(JSON.stringify({ width: "wide" }))).toEqual(
      defaultWindowState,
    );
  });

  it("accepts windows intersecting a display and rejects off-screen windows", () => {
    expect(
      isWindowStateVisible(
        { x: 100, y: 100, width: 1200, height: 800, isMaximized: false },
        [display],
      ),
    ).toBe(true);
    expect(
      isWindowStateVisible(
        { x: 3000, y: 100, width: 800, height: 600, isMaximized: false },
        [display],
      ),
    ).toBe(false);
    expect(isWindowStateVisible(defaultWindowState, [display])).toBe(false);
  });
});
