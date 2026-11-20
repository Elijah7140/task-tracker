import { describe, expect, it } from "@effect/vitest";
import { snoozeUntil } from "../../src/index.js";

const now = Temporal.Instant.from("2026-11-17T22:30:00Z");
const nine = Temporal.PlainTime.from("09:00");

describe("snoozeUntil", () => {
  it("Defers by ten minutes or one hour from now", () => {
    const tenMinutes = snoozeUntil("tenMinutes", now, "UTC", nine);
    const oneHour = snoozeUntil("oneHour", now, "UTC", nine);

    expect(tenMinutes.toString()).toBe("2026-11-17T22:40:00Z");
    expect(oneHour.toString()).toBe("2026-11-17T23:30:00Z");
  });

  it("Defers until tomorrow's local reminder time in the server zone", () => {
    const zone = "America/New_York";

    const tomorrow = snoozeUntil("tomorrow", now, zone, Temporal.PlainTime.from("10:30"));

    expect(tomorrow.toString()).toBe("2026-11-18T15:30:00Z");
  });

  it("Uses the local date, which can differ from the UTC date", () => {
    const zone = "Asia/Tokyo";

    const tomorrow = snoozeUntil("tomorrow", now, zone, nine);

    expect(tomorrow.toString()).toBe("2026-11-19T00:00:00Z");
  });
});
