// Runs in the browser project, whose fixed en-US locale the expected strings assume.
import { describe, expect, it } from "vitest";
import {
  deadlineLabel,
  formatFloatingDate,
  formatFloatingDateTime,
  formatInstantDate,
} from "../../src/format/item-dates.js";

const item = {
  dueDate: null,
  dueTime: null,
} as const;

describe("formatFloatingDate", () => {
  it("Formats a calendar date without shifting it", () => {
    const text = formatFloatingDate("2026-11-20");

    expect(text).toBe("Nov 20, 2026");
  });
});

describe("formatFloatingDateTime", () => {
  it("Formats a separate wall-clock time with seven fractional digits", () => {
    const text = formatFloatingDateTime("2026-11-20", "15:30:00.0000000");

    expect(text).toBe("Nov 20, 2026, 3:30 PM");
  });

  it("Keeps a wall-clock time that a daylight saving change skips", () => {
    const text = formatFloatingDateTime("2026-03-08", "02:30:00");

    expect(text).toBe("Mar 8, 2026, 2:30 AM");
  });
});

describe("formatInstantDate", () => {
  it("Shows a UTC instant's date in the server's zone", () => {
    const instant = "2026-11-14T03:00:00.1234567Z";

    const utc = formatInstantDate(instant, "UTC");
    const newYork = formatInstantDate(instant, "America/New_York");

    expect(utc).toBe("Nov 14, 2026");
    expect(newYork).toBe("Nov 13, 2026");
  });
});

describe("deadlineLabel", () => {
  it("Shows the due date with its time", () => {
    const label = deadlineLabel({
      ...item,
      dueDate: "2026-11-20",
      dueTime: "09:00:00",
    } as Parameters<typeof deadlineLabel>[0]);

    expect(label).toEqual({ kind: "due", text: "Nov 20, 2026, 9:00 AM" });
  });

  it("Returns null without a due date", () => {
    const label = deadlineLabel(item as Parameters<typeof deadlineLabel>[0]);

    expect(label).toBeNull();
  });
});
