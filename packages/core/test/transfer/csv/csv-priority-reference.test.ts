import { describe, expect, it } from "@effect/vitest";
import type { PriorityLevel } from "../../../src/index.js";
import {
  matchCsvPriorityLabel,
  matchCsvPriorityReference,
  writeCsvPriorityReference,
} from "../../../src/transfer/csv/csv-priority-reference.js";

const level = (
  id: string,
  name: string,
  number: number | null,
  isArchived = false,
): PriorityLevel => ({
  id,
  name,
  number,
  colorKey: null,
  isBuiltIn: false,
  isArchived,
  sortOrder: 0,
});

const high = level("019A0000-0000-7000-8000-000000000102", "High", null);
const seven = level("01A1F637-48E9-7296-92A1-37337D9CFFC9", "", 7);
const namedSeven = level("01A1F637-0000-7000-8000-000000000007", "7", null);
const oldEight = level("01A1F637-48EB-7D52-B5CA-49B075DEEE4F", "", 8, true);
const levels = [high, seven, namedSeven, oldEight];

describe("CSV priority references", () => {
  it("Writes a name, a number or an archived level's lowercase id", () => {
    const written = [high, seven, oldEight, null].map(writeCsvPriorityReference);

    expect(written).toEqual(["#name:High", "#7", "#id:01a1f637-48eb-7d52-b5ca-49b075deee4f", ""]);
  });

  it("Matches each written reference back to its own level", () => {
    const matched = [
      "#NAME:high",
      "#7",
      "#07",
      "#id:01A1F637-48EB-7D52-B5CA-49B075DEEE4F",
      "#name:7",
    ].map((cell) => matchCsvPriorityReference(cell, levels).map((match) => match.id));

    expect(matched).toEqual([[high.id], [seven.id], [seven.id], [oldEight.id], [namedSeven.id]]);
  });

  it("Matches nothing for an archived number, a bad id or a number outside the int range", () => {
    const matched = ["#8", "#id:not-a-guid", "#0", "#2147483648", "# 7", "High"].map((cell) =>
      matchCsvPriorityReference(cell, levels),
    );

    expect(matched.every((matches) => matches.length === 0)).toBe(true);
  });

  it("Matches a legacy Priority cell by name or label, which may be ambiguous", () => {
    const labelled = matchCsvPriorityLabel("7", levels).map((match) => match.id);
    const named = matchCsvPriorityLabel("high", levels).map((match) => match.id);

    expect(labelled).toEqual([seven.id, namedSeven.id]);
    expect(named).toEqual([high.id]);
  });
});
