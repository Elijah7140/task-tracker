import { describe, expect, it } from "vitest";
import { edgeScrollStep } from "../../src/ui/edge-scroll.js";

const viewport = { top: 100, bottom: 500 };

describe("edge scrolling", () => {
  it("Scrolls only near an edge, faster as the pointer approaches it", () => {
    const steps = [300, 460, 490, 499, 140, 101].map((y) => edgeScrollStep(y, viewport));

    expect(steps[0]).toBe(0);
    expect(steps[1]).toBeGreaterThan(0);
    expect(steps[2]).toBeGreaterThan(steps[1]!);
    expect(steps[3]).toBeGreaterThan(steps[2]!);
    expect(steps[4]).toBeLessThan(0);
    expect(steps[5]).toBeLessThan(steps[4]!);
  });

  it("Never exceeds the maximum step and ignores a pointer outside the viewport", () => {
    expect(edgeScrollStep(500, viewport)).toBe(16);
    expect(edgeScrollStep(100, viewport)).toBe(-16);
    expect(edgeScrollStep(520, viewport)).toBe(0);
    expect(edgeScrollStep(80, viewport)).toBe(0);
  });

  it("Uses half the height as the edge zone in a short viewport", () => {
    const short = { top: 0, bottom: 40 };

    expect(edgeScrollStep(20, short)).toBe(0);
    expect(edgeScrollStep(30, short)).toBe(8);
  });
});
