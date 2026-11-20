import { describe, expect, it } from "vitest";
import { foldSearchText } from "../../src/index.js";

describe("foldSearchText", () => {
  it.each([
    ["ÉCOLE", "école"],
    ["ΟΣ", "οσ"],
    ["ος", "οσ"],
    ["ς", "σ"],
    ["ΧΡΌΝΟΣ ΟΣ", "χρόνοσ οσ"],
    ["STRAẞE", "straße"],
    ["straße", "straße"],
    ["ﬁle", "ﬁle"],
  ])("Folds %j to %j like the legacy invariant upper-then-lower rule", (input, expected) => {
    const folded = foldSearchText(input);

    expect(folded).toBe(expected);
  });
});
