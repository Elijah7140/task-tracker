import { describe, expect, it } from "vitest";
import { computeCardColumns } from "../../src/workspace/card-grid-layout.js";

/** A 2560 px screen with a 300 px sidebar and padding beside the grid. */
const wideScreen = { screenWidth: 2560, chromeWidth: 300 };

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

  it("Shows every preferred column when a scaled window fills the screen", () => {
    const fullGrid = wideScreen.screenWidth - wideScreen.chromeWidth;

    const columns = computeCardColumns(fullGrid, 4, { screen: wideScreen });

    expect(columns).toBe(4);
  });

  it("Keeps about the full-screen card width so a half-width window shows half the cards", () => {
    const halfGrid = wideScreen.screenWidth / 2 - wideScreen.chromeWidth;

    const columns = computeCardColumns(halfGrid, 4, { screen: wideScreen });

    expect(columns).toBe(2);
  });

  it("Rounds to the nearest count of full-screen-width cards", () => {
    const threeQuarterGrid = (wideScreen.screenWidth * 3) / 4 - wideScreen.chromeWidth;

    const columns = computeCardColumns(threeQuarterGrid, 4, { screen: wideScreen });

    expect(columns).toBe(3);
  });

  it("Never shows more than the preferred count in a window wider than the screen", () => {
    const columns = computeCardColumns(4000, 4, { screen: wideScreen });

    expect(columns).toBe(4);
  });

  it("Keeps at least one column in a scaled window narrower than one card", () => {
    const columns = computeCardColumns(300, 2, { screen: wideScreen });

    expect(columns).toBe(1);
  });

  it("Keeps the 220 px floor when the full-screen card would be narrower", () => {
    const smallScreen = { screenWidth: 1280, chromeWidth: 300 };

    const columns = computeCardColumns(980, 8, { screen: smallScreen });

    expect(columns).toBe(4);
  });

  it("Falls back to the fixed count while the screen width is unknown", () => {
    const unknown = { screenWidth: 0, chromeWidth: 300 };

    const columns = computeCardColumns(1036, 4, { screen: unknown });

    expect(columns).toBe(4);
  });
});
