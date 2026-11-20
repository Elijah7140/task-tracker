import { describe, expect, it } from "vitest";
import {
  moveActiveLookup,
  partitionLookups,
  swapActiveLookup,
} from "../../src/settings/lookup-order.js";

const rows = [
  { id: "A", name: "Critical", isArchived: false, sortOrder: 0 },
  { id: "B", name: "Retired", isArchived: true, sortOrder: 1 },
  { id: "C", name: "High", isArchived: false, sortOrder: 2 },
  { id: "D", name: "Medium", isArchived: false, sortOrder: 3 },
  { id: "E", name: "Low", isArchived: false, sortOrder: 4 },
];

describe("partitionLookups", () => {
  it("Splits active and archived rows in sort order", () => {
    const unsorted = [rows[4]!, rows[1]!, rows[0]!, rows[3]!, rows[2]!];

    const result = partitionLookups(unsorted);

    expect(result.active.map((row) => row.id)).toEqual(["A", "C", "D", "E"]);
    expect(result.archived.map((row) => row.id)).toEqual(["B"]);
  });
});

describe("swapActiveLookup", () => {
  it("Swaps adjacent active rows and preserves archived rows in the complete ID order", () => {
    const movedUp = swapActiveLookup(rows, "C", -1);
    const movedDown = swapActiveLookup(rows, "C", 1);

    expect(movedUp).toEqual(["C", "B", "A", "D", "E"]);
    expect(movedDown).toEqual(["A", "B", "D", "C", "E"]);
  });

  it("Returns null when moving past the start or end of active rows", () => {
    expect(swapActiveLookup(rows, "A", -1)).toBeNull();
    expect(swapActiveLookup(rows, "E", 1)).toBeNull();
  });
});

describe("moveActiveLookup", () => {
  it("Moves an active row to a target active row while keeping every archived ID", () => {
    expect(moveActiveLookup(rows, "E", "C")).toEqual(["A", "B", "E", "C", "D"]);
    expect(moveActiveLookup(rows, "A", "D")).toEqual(["C", "B", "D", "A", "E"]);
    expect(moveActiveLookup(rows, "C", "C")).toBeNull();
  });
});
