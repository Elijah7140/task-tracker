import { describe, expect, it } from "vitest";
import { formatNumber, parseNumber } from "../../src/editor/number-text.js";

describe("formatNumber", () => {
  it("Shows nothing for a missing number", () => {
    const text = formatNumber(null, "en-US");

    expect(text).toBe("");
  });

  it("Shows a stored number without grouping", () => {
    const text = formatNumber(12500.25, "en-US");

    expect(text).toBe("12500.25");
  });

  it("Uses the locale's decimal separator", () => {
    const text = formatNumber(1.5, "fr-FR");

    expect(text).toBe("1,5");
  });
});

describe("parseNumber", () => {
  it("Treats blank text as no value", () => {
    const parsed = parseNumber("  ", "en-US");

    expect(parsed).toEqual({ kind: "blank" });
  });

  it("Parses a decimal number", () => {
    const parsed = parseNumber("12.5", "en-US");

    expect(parsed).toEqual({ kind: "number", value: 12.5 });
  });

  it("Parses signs and exponents", () => {
    const parsed = [parseNumber("-3", "en-US"), parseNumber("1e3", "en-US")];

    expect(parsed).toEqual([
      { kind: "number", value: -3 },
      { kind: "number", value: 1000 },
    ]);
  });

  it.each(["twelve", "1.2.3", "Infinity", "NaN", "1e999", "1,000"])(
    "Rejects %s, which is not a finite number",
    (text) => {
      const parsed = parseNumber(text, "en-US");

      expect(parsed).toEqual({ kind: "invalid" });
    },
  );

  it("Parses the locale's decimal separator", () => {
    const parsed = parseNumber("12,5", "fr-FR");

    expect(parsed).toEqual({ kind: "number", value: 12.5 });
  });
});
