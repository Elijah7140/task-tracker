import { describe, expect, it } from "vitest";
import {
  describeRepeat,
  isoWeekday,
  type RepeatRule,
} from "../../src/format/recurrence-summary.js";

const rule = (overrides: Partial<RepeatRule>): RepeatRule => ({
  frequency: "Daily",
  interval: 1,
  weekdays: null,
  monthDay: null,
  month: null,
  anchor: "DueDate",
  endKind: "Never",
  endDate: null,
  remaining: null,
  ...overrides,
});

describe("describeRepeat", () => {
  it("Presents weekdays, month end and a leap day as the server does", () => {
    const rules = [
      rule({ frequency: "Weekly", interval: 2, weekdays: 1 | 8 }),
      rule({ frequency: "Monthly", monthDay: 0 }),
      rule({ frequency: "Yearly", monthDay: 29, month: 2 }),
      rule({ interval: 3 }),
      rule({ frequency: "Monthly", interval: 2, monthDay: 15 }),
    ];

    const summaries = rules.map(describeRepeat);

    expect(summaries).toEqual([
      "Every 2 weeks on Mon, Thu",
      "Monthly on the last day",
      "Every year on 29 Feb",
      "Every 3 days",
      "Every 2 months on day 15",
    ]);
  });
});

describe("isoWeekday", () => {
  it.each([
    ["2026-11-16", 1],
    ["2026-11-19", 4],
    ["2026-11-22", 7],
    ["2024-02-29", 4],
    ["2000-01-01", 6],
  ])("Gives %s the Monday-first day %i", (date, expected) => {
    expect(isoWeekday(date)).toBe(expected);
  });
});
