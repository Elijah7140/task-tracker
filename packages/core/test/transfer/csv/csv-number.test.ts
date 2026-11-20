import { describe, expect, it } from "@effect/vitest";
import { parseCsvNumber } from "../../../src/transfer/csv/csv-number.js";

describe("CSV numbers", () => {
  it.each([
    ["2.5", 2.5],
    ["-3", -3],
    ["+.5", 0.5],
    ["5.", 5],
    ["1e3", 1000],
    ["1E-05", 0.00001],
    ["007", 7],
  ])("Reads invariant number %j", (text, expected) => {
    const value = parseCsvNumber(text);

    expect(value).toBe(expected);
  });

  it.each(["2,5", "1,000", "0x10", "Infinity", "NaN", "1e400", "", "1e", "--1", "1 000"])(
    "Refuses %j",
    (text) => {
      const value = parseCsvNumber(text);

      expect(value).toBeNull();
    },
  );
});
