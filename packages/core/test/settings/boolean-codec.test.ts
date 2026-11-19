import { expect, it } from "@effect/vitest";
import { booleanCodec, SettingsCatalogue } from "../../src/index.js";

it("round-trips settings text with invariant Boolean and duration text", () => {
  const boolean = SettingsCatalogue.autoCompleteParents;
  const duration = SettingsCatalogue.urgencyYellowThreshold;

  expect(boolean.format(boolean.parse("true"))).toBe("true");
  expect(duration.format(duration.parse("P2DT3H"))).toBe("P2DT3H");
});

it("reads case and whitespace as legacy does and writes lowercase Boolean text", () => {
  expect(booleanCodec.parse(" TrUe ")).toBe(true);
  expect(booleanCodec.parse("\tFALSE\n")).toBe(false);
  expect(booleanCodec.format(false)).toBe("false");
});
