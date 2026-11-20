import { describe, expect, it } from "@effect/vitest";
import { parseCsvYesNo } from "../../../src/transfer/csv/csv-yes-no.js";

describe("CSV yes and no", () => {
  it("Reads the legacy words ignoring case and refuses anything else", () => {
    const answers = ["yes", "Y", "TRUE", "1", "no", "n", "False", "0", "maybe", "ja"].map(
      parseCsvYesNo,
    );

    expect(answers).toEqual([true, true, true, true, false, false, false, false, null, null]);
  });
});
