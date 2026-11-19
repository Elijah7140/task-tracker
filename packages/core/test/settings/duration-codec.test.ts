import { expect, it } from "@effect/vitest";
import { durationCodec } from "../../src/index.js";

it.each([
  ["P1D", 864_000_000_000n],
  ["PT3H", 108_000_000_000n],
  ["PT0.5S", 5_000_000n],
  ["PT0S", 0n],
  ["-PT0.0000001S", -1n],
  ["P10675199DT2H48M5.4775807S", 9_223_372_036_854_775_807n],
  ["-P10675199DT2H48M5.4775808S", -9_223_372_036_854_775_808n],
])("reads and writes the legacy duration %s exactly", (text, ticks) => {
  expect(durationCodec.parse(text)).toBe(ticks);
  expect(durationCodec.format(ticks)).toBe(text);
});

it.each([
  ["PT24H", "P1D"],
  ["P1Y13M", "P760D"],
  ["PT.50000009S", "PT0.5S"],
])("normalizes the duration %s as XmlConvert does", (input, output) => {
  const ticks = durationCodec.parse(input);

  expect(durationCodec.format(ticks)).toBe(output);
});

it.each(["P1DT", "P1W", "PT1,5S", "PT2147483648S", "P10675199DT2H48M5.4775808S"])(
  "rejects the duration %s like XmlConvert",
  (text) => {
    expect(() => durationCodec.parse(text)).toThrow(/duration/i);
  },
);
