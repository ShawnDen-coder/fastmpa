import { describe, expect, it, vi } from "vitest";
import { EventBatcher } from "../src/main/event-batcher.js";

describe("EventBatcher", () => {
  it("preserves order and flushes on the time boundary", () => {
    vi.useFakeTimers();
    const batches: number[][] = [];
    const batcher = new EventBatcher<number>(
      (events) => batches.push([...events]),
      100,
      16,
      () => 1,
    );
    batcher.push(1);
    batcher.push(2);
    expect(batches).toEqual([]);
    vi.advanceTimersByTime(16);
    expect(batches).toEqual([[1, 2]]);
    vi.useRealTimers();
  });

  it("flushes immediately when the byte threshold is reached", () => {
    const batches: string[][] = [];
    const batcher = new EventBatcher<string>(
      (events) => batches.push([...events]),
      4,
      16,
      () => 2,
    );
    batcher.push("a");
    batcher.push("b");
    expect(batches).toEqual([["a", "b"]]);
  });
});
