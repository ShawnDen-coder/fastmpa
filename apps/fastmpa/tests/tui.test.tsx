import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import type { FastMpaApplication } from "../src/application.js";
import { FastMpaTui } from "../src/tui/app.js";

describe("FastMpaTui", () => {
  it("renders the workspace and run columns from Application state", async () => {
    const application = {
      start: async () => undefined,
      stop: async () => undefined,
      getSnapshot: async () => ({
        workspaces: ["default"],
        conversations: [],
        participants: [],
        messages: [],
        runs: [],
        schedules: [],
      }),
      dispatch: async () => ({}),
      subscribe: () => () => undefined,
    } satisfies FastMpaApplication;
    const view = render(<FastMpaTui application={application} />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(view.lastFrame()).toContain("Workspace");
    expect(view.lastFrame()).toContain("Runs");
    view.unmount();
  });
});
