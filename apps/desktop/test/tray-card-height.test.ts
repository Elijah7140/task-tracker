import { describe, expect, it } from "vitest";
import { trayCardHeight } from "../src/tray-card-height.js";

describe("trayCardHeight", () => {
  it("Rounds a reported height up to whole pixels", () => {
    const height = trayCardHeight(140.2, 1000);

    expect(height).toBe(141);
  });

  it("Grows up to the height the working area leaves, then stops", () => {
    const tiny = trayCardHeight(3, 1000);

    const huge = trayCardHeight(10_000, 1016);

    expect(tiny).toBe(80);
    expect(huge).toBe(1016);
  });

  it("Keeps its smallest height on a working area shorter than that", () => {
    const height = trayCardHeight(500, 40);

    expect(height).toBe(80);
  });

  it("Ignores a value that is not a finite number", () => {
    const values = ["200", Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}];

    const heights = values.map((value) => trayCardHeight(value, 1000));

    expect(heights).toEqual(values.map(() => undefined));
  });
});
