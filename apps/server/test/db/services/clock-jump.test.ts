import { describe, expect, it } from "@effect/vitest";
import { isClockJump } from "../../../src/services/clock-jump.js";

const start = { wallMillis: 1_000_000, monotonicNanos: 5_000_000_000n };

describe("isClockJump", () => {
  it("Treats a wall change that matches the elapsed time as steady", () => {
    const next = { wallMillis: start.wallMillis + 1_000, monotonicNanos: 6_000_000_000n };

    const jumped = isClockJump(start, next);

    expect(jumped).toBe(false);
  });

  it("Tolerates timer jitter below a quarter second", () => {
    const next = { wallMillis: start.wallMillis + 1_249, monotonicNanos: 6_000_000_000n };

    const jumped = isClockJump(start, next);

    expect(jumped).toBe(false);
  });

  it("Detects a wall clock moved forward", () => {
    const next = { wallMillis: start.wallMillis + 1_250, monotonicNanos: 6_000_000_000n };

    const jumped = isClockJump(start, next);

    expect(jumped).toBe(true);
  });

  it("Detects a wall clock set back", () => {
    const next = { wallMillis: start.wallMillis - 60_000, monotonicNanos: 6_000_000_000n };

    const jumped = isClockJump(start, next);

    expect(jumped).toBe(true);
  });

  it("Detects a resume where the monotonic clock stood still during sleep", () => {
    const next = { wallMillis: start.wallMillis + 3_600_000, monotonicNanos: 6_000_000_000n };

    const jumped = isClockJump(start, next);

    expect(jumped).toBe(true);
  });
});
