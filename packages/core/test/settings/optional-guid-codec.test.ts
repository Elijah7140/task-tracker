import { expect, it } from "@effect/vitest";
import { optionalGuidCodec, SettingsCatalogue } from "../../src/index.js";

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

it("stores the current item as a global setting with no default", () => {
  const definition = SettingsCatalogue.currentItemId;

  expect(definition.key).toBe("currentItemId");
  expect(definition.defaultValue).toBeNull();
  expect(definition.projectOverridable).toBe(false);
});
