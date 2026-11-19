import { Schema } from "effect";
import { expect, it } from "vitest";
import { DurationTicks } from "../src/duration-ticks.js";

it("Round-trips exact TimeSpan tick counts beyond the safe integer range", () => {
  const maximum = "9223372036854775807";

  const decoded = Schema.decodeUnknownSync(DurationTicks)(maximum);

  expect(decoded).toBe(maximum);
  expect(Schema.encodeSync(DurationTicks)(decoded)).toBe(maximum);
  expect(Schema.decodeUnknownSync(DurationTicks)("0")).toBe("0");
});

it.each(["-1", "1.5", "P1D", "", "9223372036854775808", "99999999999999999999"])(
  "Rejects %j as a duration",
  (text) => {
    expect(() => Schema.decodeUnknownSync(DurationTicks)(text)).toThrow();
  },
);
