import { expect, it } from "@effect/vitest";
import { FloatingTime } from "../../src/index.js";

it("resolves the New York gap to the first valid fractional instant", () => {
  const zone = "America/New_York";
  const local = Temporal.PlainDateTime.from("2026-03-08T02:30:00.1234567");

  const actual = FloatingTime.toUtc(local, zone);

  expect(actual.toString()).toBe("2026-03-08T07:00:00Z");
});

it("uses the earlier instant for an ambiguous time", () => {
  const zone = "Europe/London";

  const actual = FloatingTime.toUtc(Temporal.PlainDateTime.from("2026-10-25T01:30:00"), zone);

  expect(actual.toString()).toBe("2026-10-25T00:30:00Z");
});

it("uses the end of the transition day for a date-only deadline", () => {
  const zone = "America/New_York";

  const actual = FloatingTime.dueToUtc(Temporal.PlainDate.from("2026-03-08"), null, zone);

  expect(actual.toString()).toBe("2026-03-09T03:59:59.9999999Z");
});

it("uses the specified local time for an explicit due time", () => {
  const zone = "America/New_York";

  const actual = FloatingTime.dueToUtc(
    Temporal.PlainDate.from("2026-03-08"),
    Temporal.PlainTime.from("15:00"),
    zone,
  );

  expect(actual.toString()).toBe("2026-03-08T19:00:00Z");
});
