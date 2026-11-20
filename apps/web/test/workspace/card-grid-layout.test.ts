import { describe, expect, it } from "vitest";
import { computeCardColumns, computeCardMinHeight } from "../../src/workspace/card-grid-layout.js";

describe("card-grid-layout", () => {
  it("Uses the preferred column count when the container is wide enough", () => {
    expect(computeCardColumns(1036, 4)).toBe(4);
    expect(computeCardColumns(1036, 2)).toBe(2);
  });

  it("Uses fewer columns than the setting when the pane is narrow", () => {
    expect(computeCardColumns(500, 4)).toBe(2);
    expect(computeCardColumns(200, 4)).toBe(1);
  });

  it("Clamps preferred columns between 1 and 8", () => {
    expect(computeCardColumns(2400, 0)).toBe(1);
    expect(computeCardColumns(2400, 12)).toBe(8);
  });

  it("Computes a minimum row height so about two rows fill the viewport", () => {
    expect(computeCardMinHeight(640)).toBe(288);
    expect(computeCardMinHeight(40)).toBe(0);
  });
});
