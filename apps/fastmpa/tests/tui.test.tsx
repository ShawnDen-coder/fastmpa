import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import type { FastMpaApplication } from "../src/application.js";
import { FastMpaTui } from "../src/tui/app.js";

describe("FastMpaTui", () => {
  it("renders the selected conversation as the default view", async () => {
    const application = {
      start: async () => undefined,
      stop: async () => undefined,
      getSnapshot: async () => ({
        workspaces: [
          {
            id: "default",
            name: "Default Workspace",
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01",
          },
        ],
        conversations: [],
        participants: [],
        messages: [],
        runs: [],
        schedules: [],
      }),
      dispatch: async () => ({}),
      subscribe: () => () => undefined,
      subscribeEvents: () => () => undefined,
      getRecentLogs: () => [],
      subscribeLogs: () => () => undefined,
      getLogPath: () => "fastmpa.log",
    } satisfies FastMpaApplication;
    const view = render(<FastMpaTui application={application} />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(view.lastFrame()).toContain("FastMPA");
    expect(view.lastFrame()).toContain("Continuous Conversation");
    expect(view.lastFrame()).not.toContain("Runs / Approval / Schedule");
    view.unmount();
  });
});
