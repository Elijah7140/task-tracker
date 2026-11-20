import { describe, expect, it } from "vitest";
import { moveAmongVisible, swapWithVisibleNeighbor } from "../../src/workspace/reorder-plan.js";

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
