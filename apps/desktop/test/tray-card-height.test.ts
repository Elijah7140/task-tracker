import { describe, expect, it } from "vitest";
import { trayCardHeight } from "../src/tray-card-height.js";

describe("trayCardHeight", () => {
  it("Rounds a reported height up to whole pixels", () => {
    const height = trayCardHeight(140.2);

    expect(height).toBe(141);
  });

  it("Keeps the window between its smallest and largest height", () => {
    const tiny = trayCardHeight(3);

    const huge = trayCardHeight(10_000);

    expect(tiny).toBe(80);
    expect(huge).toBe(640);
  });

  it("Ignores a value that is not a finite number", () => {
    const values = ["200", Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}];

    const heights = values.map(trayCardHeight);

    expect(heights).toEqual(values.map(() => undefined));
  });
});
