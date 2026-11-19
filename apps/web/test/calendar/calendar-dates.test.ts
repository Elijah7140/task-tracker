import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  firstDayOfWeek,
  formatDayName,
  formatIsoDateInZone,
  formatMonthTitle,
  formatWeekTitle,
  monthRange,
  startOfWeek,
  weekRange,
  weekdayHeaders,
} from "../../src/calendar/calendar-dates.js";

describe("week start", () => {
  it.each([
    ["en-US", "2026-11-15"],
    ["de-DE", "2026-11-16"],
  ])("Starts the %s week on its first day of week", (locale, expected) => {
    const weekStartsOn = firstDayOfWeek(locale);

    const start = startOfWeek("2026-11-18", weekStartsOn);

    expect(start).toBe(expected);
  });

  it.each([
    ["en-US", "2026-11-01"],
    ["de-DE", "2026-10-26"],
  ])("Starts the %s month grid on the culture's first day of week", (locale, expected) => {
    const range = monthRange("2026-11-18", firstDayOfWeek(locale));

    expect(range.fromDate).toBe(expected);
    expect(range.toDateExclusive).toBe(addDays(expected, 42));
  });

  it("Shows seven days from the culture's first day in a week range", () => {
    const range = weekRange("2026-11-18", firstDayOfWeek("en-US"));

    expect(range).toEqual({ fromDate: "2026-11-15", toDateExclusive: "2026-11-22" });
  });

  it("Lists weekday headers from the first day of week", () => {
    const headers = weekdayHeaders(1, "en-US");

    expect(headers).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});

describe("period movement", () => {
  it("Lands on the first of the next month when moving by month from the 31st", () => {
    const next = addMonths("2026-01-31", 1);
    const previous = addMonths("2026-03-31", -1);

    expect(next).toBe("2026-02-01");
    expect(previous).toBe("2026-02-01");
  });

  it("Shifts a week range by seven days", () => {
    const moved = addDays("2026-11-30", 7);

    expect(moved).toBe("2026-12-07");
  });
});

describe("titles", () => {
  it("Formats a month title", () => {
    const title = formatMonthTitle("2026-11-16", "en-US");

    expect(title).toBe("November 2026");
  });

  it.each([
    ["en-US", "Nov 16 – 22, 2026"],
    ["de-DE", "16. – 22. Nov 2026"],
    ["en-GB", "16 – 22 Nov 2026"],
  ])("Orders the %s week title the way the culture writes dates", (locale, expected) => {
    const title = formatWeekTitle("2026-11-16", locale);

    expect(title).toBe(expected);
  });

  it.each([
    ["en-US", "Nov 29 – Dec 5, 2026"],
    ["de-DE", "29. Nov. – 5. Dez. 2026"],
  ])("Names both months in a %s week that spans two", (locale, expected) => {
    const title = formatWeekTitle("2026-11-29", locale);

    expect(title).toBe(expected);
  });

  it("Names both years when the week spans the new year", () => {
    const title = formatWeekTitle("2026-12-28", "en-US");

    expect(title).toBe("Dec 28, 2026 – Jan 3, 2027");
  });

  it("Names a whole day for accessible labels", () => {
    const name = formatDayName("2026-11-16", "en-US");

    expect(name).toBe("Monday, November 16, 2026");
  });
});

describe("formatIsoDateInZone", () => {
  it("Reads the local date in the zone passed in", () => {
    const instant = Date.parse("2026-11-16T02:00:00Z");

    const newYork = formatIsoDateInZone(instant, "America/New_York");
    const utc = formatIsoDateInZone(instant, "UTC");

    expect(newYork).toBe("2026-11-15");
    expect(utc).toBe("2026-11-16");
  });
});
