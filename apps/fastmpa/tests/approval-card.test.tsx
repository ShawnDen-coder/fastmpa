import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { ApprovalCard } from "../src/tui/approval-card.js";

describe("ApprovalCard", () => {
  it("renders the selected action and keyboard affordance", () => {
    const view = render(
      <ApprovalCard
        toolName="tapd.update"
        approvalId="approval-1"
        selectedAction={2}
      />,
    );
    expect(view.lastFrame()).toContain("[Details]");
    expect(view.lastFrame()).toContain("Enter confirm");
    view.unmount();
  });
});
