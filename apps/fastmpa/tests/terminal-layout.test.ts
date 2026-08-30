import { describe, expect, it } from "vitest";
import { tuiLayout } from "../src/tui/terminal-layout.js";

describe("tuiLayout", () => {
  it.each([
    [40, false, false, 8],
    [80, true, false, 12],
    [120, true, true, 16],
  ])(
    "keeps the conversation usable at %i columns",
    (columns, secondary, context, lines) => {
      expect(tuiLayout(columns)).toEqual({
        showSecondaryMetadata: secondary,
        showRunContext: context,
        maxLogLines: lines,
      });
    },
  );
});
