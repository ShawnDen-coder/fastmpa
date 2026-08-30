import { beforeEach, describe, expect, it } from "vitest";
import { useLogStore } from "./stores.js";

function log(sequence: number) {
  return {
    sequence,
    timestamp: new Date(sequence).toISOString(),
    level: "info" as const,
    component: "test",
    message: `message-${sequence}`,
    context: {},
  };
}

describe("logStore", () => {
  beforeEach(() => useLogStore.setState({ entries: [] }));

  it("keeps at most 500 live entries", () => {
    for (let sequence = 1; sequence <= 501; sequence += 1)
      useLogStore.getState().append(log(sequence));

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(500);
    expect(entries[0]?.sequence).toBe(2);
    expect(entries.at(-1)?.sequence).toBe(501);
  });

  it("merges history with live entries by sequence", () => {
    useLogStore.getState().append(log(3));
    useLogStore.getState().mergeHistory([log(1), log(2), log(3), log(4)]);

    expect(
      useLogStore.getState().entries.map((entry) => entry.sequence),
    ).toEqual([1, 2, 3, 4]);
  });
});
