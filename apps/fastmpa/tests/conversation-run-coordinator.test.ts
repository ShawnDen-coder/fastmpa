import { describe, expect, it } from "vitest";
import { ConversationRunCoordinator } from "../src/conversation-run-coordinator.js";

describe("ConversationRunCoordinator", () => {
  it("serializes one conversation while allowing another to start", async () => {
    const coordinator = new ConversationRunCoordinator();
    const events: string[] = [];
    let release!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = coordinator.enqueue("workspace:conversation", async () => {
      events.push("first-start");
      await firstGate;
      events.push("first-end");
      return "first";
    });
    const second = coordinator.enqueue("workspace:conversation", async () => {
      events.push("second-start");
      return "second";
    });
    const parallel = coordinator.enqueue("workspace:other", async () => {
      events.push("parallel");
      return "parallel";
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["first-start", "parallel"]);
    release();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    await expect(parallel).resolves.toBe("parallel");
    expect(events).toEqual([
      "first-start",
      "parallel",
      "first-end",
      "second-start",
    ]);
  });

  it("continues the queue after a failed item", async () => {
    const coordinator = new ConversationRunCoordinator();
    const second = coordinator.enqueue("key", async () => {
      throw new Error("failed");
    });
    const third = coordinator.enqueue("key", async () => "continued");
    await expect(second).rejects.toThrow("failed");
    await expect(third).resolves.toBe("continued");
  });
});
