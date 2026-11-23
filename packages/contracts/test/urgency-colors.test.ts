import { Schema } from "effect";
import { expect, it } from "vitest";
import { UrgencyColors } from "../src/urgency-colors.js";

it("Accepts #rrggbb colors and null for the theme color", () => {
  const colors = { approaching: "#00AA88", overdue: null };

  const decoded = Schema.decodeUnknownSync(UrgencyColors)(colors);

  expect(decoded).toEqual(colors);
});

it.each(["yellow", "#abc", "00aa88", "#00aa88ff", ""])("Rejects the color %j", (color) => {
  const decode = () =>
    Schema.decodeUnknownSync(UrgencyColors)({ approaching: color, overdue: null });

  expect(decode).toThrow();
});
