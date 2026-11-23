import { expect, it } from "@effect/vitest";
import { optionalHexColorCodec, SettingsCatalogue } from "../../src/index.js";

it("reads an empty or blank value as no color", () => {
  const empty = optionalHexColorCodec.parse("");

  const blank = optionalHexColorCodec.parse("  \t");

  expect(empty).toBeNull();
  expect(blank).toBeNull();
});

it("reads and writes a six-digit color in lowercase", () => {
  const text = " #A1b2C3 ";

  const value = optionalHexColorCodec.parse(text);

  expect(value).toBe("#a1b2c3");
  expect(optionalHexColorCodec.format("#A1B2C3")).toBe("#a1b2c3");
  expect(optionalHexColorCodec.format(null)).toBe("");
});

it.each(["red", "#abc", "a1b2c3", "#a1b2c3ff", "#g1b2c3"])(
  "rejects %s, which is not a #rrggbb color",
  (text) => {
    const parse = () => optionalHexColorCodec.parse(text);
    const format = () => optionalHexColorCodec.format(text);

    expect(parse).toThrow(SyntaxError);
    expect(format).toThrow(SyntaxError);
  },
);

it("declares global-only urgency colors that default to the theme colors", () => {
  const definitions = [
    SettingsCatalogue.urgencyApproachingColor,
    SettingsCatalogue.urgencyOverdueColor,
  ];

  const summaries = definitions.map(({ key, defaultValue, projectOverridable }) => ({
    key,
    defaultValue,
    projectOverridable,
  }));

  expect(summaries).toEqual([
    { key: "urgencyApproachingColor", defaultValue: null, projectOverridable: false },
    { key: "urgencyOverdueColor", defaultValue: null, projectOverridable: false },
  ]);
});
