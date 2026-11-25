import { describe, expect, it } from "vitest";
import { trayCardWidth } from "../src/tray-card-width.js";

describe("trayCardWidth", () => {
  it("Takes a Full or Compact card's width, rounded up", () => {
    const widths = [400, 299.4].map(trayCardWidth);

    expect(widths).toEqual([400, 300]);
  });

  it("Keeps the window between its narrowest and widest", () => {
    const widths = [10, 5_000].map(trayCardWidth);

    expect(widths).toEqual([260, 480]);
  });

  it("Ignores a value that is not a finite number", () => {
    const values = ["300", Number.NaN, null, {}];

    const widths = values.map(trayCardWidth);

    expect(widths).toEqual(values.map(() => undefined));
  });
});
