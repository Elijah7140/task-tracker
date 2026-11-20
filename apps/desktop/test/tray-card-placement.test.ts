import { describe, expect, it } from "vitest";
import { TRAY_CARD_MARGIN, placeTrayCard } from "../src/tray-card-placement.js";

const aboveBottomTaskbar = { x: 0, y: 0, width: 1920, height: 1032 };
const card = { width: 320, height: 200 };

describe("placeTrayCard", () => {
  it("The card sits centred just above the cursor", () => {
    const cursor = { x: 1000, y: 1050 };

    const position = placeTrayCard(aboveBottomTaskbar, card, cursor);

    expect(position).toEqual({ x: 840, y: 1032 - 200 - TRAY_CARD_MARGIN });
  });

  it("A card near the right edge stays inside the working area", () => {
    const cursor = { x: 1900, y: 1050 };

    const position = placeTrayCard(aboveBottomTaskbar, card, cursor);

    expect(position.x).toBe(1920 - 320 - TRAY_CARD_MARGIN);
  });

  it("A card below a top taskbar stays inside the working area", () => {
    const belowTopTaskbar = { x: 0, y: 48, width: 1920, height: 1032 };
    const cursor = { x: 1800, y: 20 };

    const position = placeTrayCard(belowTopTaskbar, card, cursor);

    expect(position.y).toBe(48 + TRAY_CARD_MARGIN);
  });

  it("Without a cursor the card goes in the top-right corner", () => {
    const position = placeTrayCard(aboveBottomTaskbar, card, undefined);

    expect(position).toEqual({ x: 1920 - 320 - TRAY_CARD_MARGIN, y: TRAY_CARD_MARGIN });
  });

  it("A card taller than the working area keeps its top edge on screen", () => {
    const short = { x: 100, y: 50, width: 800, height: 150 };

    const position = placeTrayCard(short, card, { x: 500, y: 300 });

    expect(position).toEqual({ x: 340, y: 50 + TRAY_CARD_MARGIN });
  });
});
