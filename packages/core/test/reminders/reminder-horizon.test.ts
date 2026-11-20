import { describe, expect, it } from "@effect/vitest";
import { largestReminderOffset, reminderDueHorizon } from "../../src/index.js";
import { ticksPerDay, ticksPerMinute } from "../../src/time/duration-ticks.js";

describe("largestReminderOffset", () => {
  it("Uses the one-week item maximum unless a stored default is larger", () => {
    const small = largestReminderOffset(["PT1H", "not a duration"]);
    const large = largestReminderOffset(["P30D", "PT2H"]);

    expect(small).toBe(10080n * ticksPerMinute);
    expect(large).toBe(30n * ticksPerDay);
  });
});

describe("reminderDueHorizon", () => {
  it("Adds the largest offset in whole days and a day of slack to the local date", () => {
    const now = Temporal.Instant.from("2026-11-17T23:30:00Z");

    const horizon = reminderDueHorizon(now, "Asia/Tokyo", 36n * 60n * ticksPerMinute);

    expect(horizon.toString()).toBe("2026-11-21");
  });
});
