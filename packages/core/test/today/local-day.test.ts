import { describe, expect, it } from "@effect/vitest";
import { currentLocalDay, localDayWindow } from "../../src/index.js";

const instant = (text: string) => Temporal.Instant.from(text);

describe("the local day window", () => {
  it.each([
    ["2026-03-08", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"],
    ["2026-11-01", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"],
    ["2026-11-13", "2026-11-13T05:00:00Z", "2026-11-14T05:00:00Z"],
  ])("New York on %s runs from %s to %s", (day, start, end) => {
    const window = localDayWindow(Temporal.PlainDate.from(day), "America/New_York");

    expect(window.startUtc.toString()).toBe(start);
    expect(window.endUtc.toString()).toBe(end);
  });

  it("Starts at the transition when local midnight falls in a daylight saving gap", () => {
    const day = Temporal.PlainDate.from("2026-09-06");

    const window = localDayWindow(day, "America/Santiago");
    const previous = localDayWindow(day.subtract({ days: 1 }), "America/Santiago");

    expect(window.startUtc.toString()).toBe("2026-09-06T04:00:00Z");
    expect(previous.endUtc.equals(window.startUtc)).toBe(true);
  });

  it("Keeps the day it was built for", () => {
    const day = Temporal.PlainDate.from("2026-11-13");

    const window = localDayWindow(day, "UTC");

    expect(window.day.equals(day)).toBe(true);
  });
});

describe("the current local day", () => {
  it.each([
    ["2026-11-14T04:59:59.999Z", "2026-11-13"],
    ["2026-11-14T05:00:00Z", "2026-11-14"],
  ])("At %s it is %s in New York", (now, day) => {
    const result = currentLocalDay(instant(now), "America/New_York");

    expect(result.toString()).toBe(day);
  });
});
