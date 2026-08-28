import { describe, expect, it } from "vitest";
import {
  canTransition,
  InvalidRunTransitionError,
  transition,
} from "../src/lifecycle.js";
import type { RunStatus } from "../src/types/run.js";

const validTransitions: ReadonlyArray<readonly [RunStatus, RunStatus]> = [
  ["queued", "running"],
  ["running", "waiting"],
  ["running", "blocked"],
  ["running", "completed"],
  ["running", "cancelled"],
  ["running", "failed"],
  ["waiting", "queued"],
  ["blocked", "queued"],
];

describe("AgentRun lifecycle", () => {
  it.each(validTransitions)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(transition(from, to)).toBe(to);
  });

  it.each([
    ["queued", "completed"],
    ["running", "queued"],
    ["completed", "running"],
    ["cancelled", "running"],
    ["failed", "running"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => transition(from, to)).toThrow(InvalidRunTransitionError);
    expect(() => transition(from, to)).toThrow(
      `Invalid AgentRun transition: ${from} -> ${to}`,
    );
  });

  it("does not allow any transition out of a terminal state", () => {
    const terminalStates: RunStatus[] = ["completed", "cancelled", "failed"];
    for (const status of terminalStates) {
      expect(canTransition(status, "running")).toBe(false);
      expect(canTransition(status, "queued")).toBe(false);
    }
  });
});
