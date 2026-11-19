import { describe, expect, it } from "vitest";
import {
  dropPlacement,
  moveAmongVisible,
  resolveDropTarget,
  swapWithVisibleNeighbor,
} from "../../src/workspace/reorder-plan.js";

const FIRST = "0190A1B2-0000-7000-8000-000000000001";
const FINISHED = "0190A1B2-0000-7000-8000-000000000002";
const SECOND = "0190A1B2-0000-7000-8000-000000000003";
const THIRD = "0190A1B2-0000-7000-8000-000000000004";

describe("swapWithVisibleNeighbor", () => {
  it("Moves down by exchanging the item with the next visible sibling while keeping finished slots", () => {
    const all = [FIRST, FINISHED, THIRD];
    const visible = [FIRST, THIRD];

    const reordered = swapWithVisibleNeighbor(all, visible, FIRST, 1);

    expect(reordered).toEqual([THIRD, FINISHED, FIRST]);
  });

  it("Moves up by exchanging the item with the previous visible sibling while keeping finished slots", () => {
    const all = [FIRST, FINISHED, THIRD];
    const visible = [FIRST, THIRD];

    const reordered = swapWithVisibleNeighbor(all, visible, THIRD, -1);

    expect(reordered).toEqual([THIRD, FINISHED, FIRST]);
  });

  it("Leaves the input arrays unchanged", () => {
    const all = [FIRST, FINISHED, THIRD];
    const visible = [FIRST, THIRD];

    swapWithVisibleNeighbor(all, visible, FIRST, 1);

    expect(all).toEqual([FIRST, FINISHED, THIRD]);
    expect(visible).toEqual([FIRST, THIRD]);
  });

  it("Returns null at boundaries or when the moved item is not visible", () => {
    const all = [FIRST, FINISHED, THIRD];
    const visible = [FIRST, THIRD];

    expect(swapWithVisibleNeighbor(all, visible, FIRST, -1)).toBeNull();
    expect(swapWithVisibleNeighbor(all, visible, THIRD, 1)).toBeNull();
    expect(swapWithVisibleNeighbor(all, visible, FINISHED, 1)).toBeNull();
  });
});

describe("moveAmongVisible", () => {
  it("Moves an open item after a later sibling while keeping interleaved finished items in place", () => {
    const all = [FIRST, FINISHED, SECOND, THIRD];
    const visible = [FIRST, SECOND, THIRD];

    const reordered = moveAmongVisible(all, visible, FIRST, THIRD, "after");

    expect(reordered).toEqual([SECOND, FINISHED, THIRD, FIRST]);
  });

  it("Moves a later open item before an earlier sibling while keeping finished slots fixed", () => {
    const all = [FIRST, FINISHED, SECOND, THIRD];
    const visible = [FIRST, SECOND, THIRD];

    const reordered = moveAmongVisible(all, visible, THIRD, FIRST, "before");

    expect(reordered).toEqual([THIRD, FINISHED, FIRST, SECOND]);
  });

  it("Returns null when the drop leaves the visible order unchanged", () => {
    const all = [FIRST, FINISHED, SECOND, THIRD];
    const visible = [FIRST, SECOND, THIRD];

    expect(moveAmongVisible(all, visible, FIRST, SECOND, "before")).toBeNull();
    expect(moveAmongVisible(all, visible, SECOND, FIRST, "after")).toBeNull();
    expect(moveAmongVisible(all, visible, FIRST, FIRST, "before")).toBeNull();
  });
});

describe("dropPlacement", () => {
  const rect = { top: 100, height: 40 };

  it("Places a downward drag after the target at or below its vertical center", () => {
    expect(dropPlacement(0, 2, 119, rect)).toBe("before");
    expect(dropPlacement(0, 2, 120, rect)).toBe("after");
    expect(dropPlacement(0, 2, 135, rect)).toBe("after");
  });

  it("Places an upward drag before the target at or above its vertical center", () => {
    expect(dropPlacement(2, 0, 120, rect)).toBe("before");
    expect(dropPlacement(2, 0, 105, rect)).toBe("before");
    expect(dropPlacement(2, 0, 121, rect)).toBe("after");
  });

  it("Treats integer CSS coordinates within 1px of a subpixel row center as hitting the center", () => {
    const subpixelRect = { top: 100.4, height: 36 };

    expect(dropPlacement(0, 2, 118, subpixelRect)).toBe("after");
    expect(dropPlacement(2, 0, 119, subpixelRect)).toBe("before");
  });
});

describe("resolveDropTarget", () => {
  const rects = [
    { id: FIRST, top: 0, height: 36 },
    { id: SECOND, top: 36, height: 36 },
    { id: THIRD, top: 72, height: 36 },
  ];

  it("Clamps points above the first row and below the last row", () => {
    const above = resolveDropTarget(rects, THIRD, -20);
    const below = resolveDropTarget(rects, FIRST, 200);

    expect(above).toEqual({ targetId: FIRST, placement: "before" });
    expect(below).toEqual({ targetId: THIRD, placement: "after" });
  });

  it("Resolves center hits to after when dragging down and before when dragging up", () => {
    const down = resolveDropTarget(rects, FIRST, 54);
    const up = resolveDropTarget(rects, THIRD, 18);

    expect(down).toEqual({ targetId: SECOND, placement: "after" });
    expect(up).toEqual({ targetId: FIRST, placement: "before" });
  });

  it("Returns null when hovering over a no-op position", () => {
    expect(resolveDropTarget(rects, FIRST, 18)).toBeNull();
    expect(resolveDropTarget(rects, FIRST, 40)).toBeNull();
    expect(resolveDropTarget(rects, SECOND, 30)).toBeNull();
  });
});
