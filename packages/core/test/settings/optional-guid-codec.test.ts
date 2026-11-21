import { expect, it } from "@effect/vitest";
import { optionalGuidCodec } from "../../src/index.js";

it("reads an empty or blank value as no identifier", () => {
  const empty = optionalGuidCodec.parse("");

  const blank = optionalGuidCodec.parse("  \t");

  expect(empty).toBeNull();
  expect(blank).toBeNull();
});

it("reads legacy lowercase identifiers in uppercase and writes them as legacy did", () => {
  const text = "0193a1b2-0000-7000-8000-000000000001";

  const value = optionalGuidCodec.parse(` ${text} `);

  expect(value).toBe("0193A1B2-0000-7000-8000-000000000001");
  expect(optionalGuidCodec.format(value)).toBe(text);
  expect(optionalGuidCodec.format(null)).toBe("");
});

it("rejects text that is not an identifier", () => {
  const parse = () => optionalGuidCodec.parse("not-a-guid");

  expect(parse).toThrow(SyntaxError);
});
