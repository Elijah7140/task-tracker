import { describe, expect, it } from "@effect/vitest";
import {
  MetadataRuleError,
  nextOccurrence,
  RecurrenceWeekday,
  recurrenceRule,
  type RecurrenceAnchor,
  type RecurrenceEndKind,
  type RecurrenceFrequency,
} from "../../../src/index.js";

const date = (text: string) => Temporal.PlainDate.from(text);

describe("next occurrence", () => {
  it.each([
    [1, "2026-11-14"],
    [3, "2026-11-16"],
  ])("Daily every %i adds the interval", (interval, expected) => {
    const start = date("2026-11-13");

    const next = nextOccurrence(recurrenceRule("Daily", { interval }), start, start);

    expect(next?.toString()).toBe(expected);
  });

  it.each([
    ["2026-11-23", 2, "2026-11-26"],
    ["2026-11-26", 1, "2026-11-30"],
    ["2026-11-26", 2, "2026-12-07"],
    ["2026-11-29", 2, "2026-12-07"],
  ])(
    "Weekly from %s every %i uses the rest of the week, then wraps past Sunday",
    (start, interval, expected) => {
      const weekdays = RecurrenceWeekday.Monday | RecurrenceWeekday.Thursday;
      const rule = recurrenceRule("Weekly", { interval, weekdays });

      const next = nextOccurrence(rule, date(start), date(start));

      expect(next?.toString()).toBe(expected);
    },
  );

  it("A due-date anchor advances only once when several weeks overdue", () => {
    const due = date("2026-11-13");
    const rule = recurrenceRule("Weekly", { weekdays: RecurrenceWeekday.Friday });

    const next = nextOccurrence(rule, due, due.add({ days: 21 }));

    expect(next?.toString()).toBe("2026-11-20");
  });

  it.each([
    ["DueDate", "2026-11-06"],
    ["CompletionDate", "2026-11-12"],
  ] as const)("The %s anchor selects its date", (anchor: RecurrenceAnchor, expected) => {
    const rule = recurrenceRule("Daily", { interval: 2, anchor });

    const next = nextOccurrence(rule, date("2026-11-04"), date("2026-11-10"));

    expect(next?.toString()).toBe(expected);
  });

  it.each([
    ["2026-01-28", 31, "2026-02-28"],
    ["2028-01-28", 31, "2028-02-29"],
    ["2026-02-28", 31, "2026-03-31"],
    ["2026-02-28", 0, "2026-03-31"],
    ["2026-03-28", 31, "2026-04-30"],
    ["2026-03-28", 15, "2026-04-15"],
    ["2026-03-28", 0, "2026-04-30"],
  ])("Monthly from %s on day %i clamps to the month end", (start, monthDay, expected) => {
    const rule = recurrenceRule("Monthly", { monthDay });

    const next = nextOccurrence(rule, date(start), date(start));

    expect(next?.toString()).toBe(expected);
  });

  it("A monthly interval can cross a year boundary", () => {
    const start = date("2026-11-30");
    const rule = recurrenceRule("Monthly", { interval: 3, monthDay: 0 });

    const next = nextOccurrence(rule, start, start);

    expect(next?.toString()).toBe("2027-02-28");
  });

  it.each([
    [1, "2025-02-28"],
    [2, "2026-02-28"],
    [4, "2028-02-29"],
  ])("Yearly 29 February every %i clamps only outside leap years", (interval, expected) => {
    const start = date("2024-02-29");
    const rule = recurrenceRule("Yearly", { interval, monthDay: 29, month: 2 });

    const next = nextOccurrence(rule, start, start);

    expect(next?.toString()).toBe(expected);
  });

  it.each([
    ["Never", null, null, true],
    ["OnDate", "2026-11-14", null, true],
    ["OnDate", "2026-11-13", null, false],
    ["AfterCount", null, 2, true],
    ["AfterCount", null, 1, false],
  ] as const)(
    "Ending %s (%s, %s) is inclusive and counts the current occurrence",
    (endKind: RecurrenceEndKind, endDate, remaining, continues) => {
      const start = date("2026-11-13");
      const rule = recurrenceRule("Daily", {
        endKind,
        endDate: endDate === null ? null : date(endDate),
        remaining,
      });

      const next = nextOccurrence(rule, start, start);

      expect(next?.toString() ?? null).toBe(continues ? "2026-11-14" : null);
    },
  );

  it.each(["Daily", "Weekly", "Monthly", "Yearly"] as const)(
    "An unrepresentable %s date ends the rule",
    (frequency: RecurrenceFrequency) => {
      const interval = 2_147_483_647;
      const rule = recurrenceRule(frequency, {
        interval,
        weekdays: frequency === "Weekly" ? RecurrenceWeekday.Monday : null,
        monthDay: frequency === "Monthly" || frequency === "Yearly" ? 1 : null,
        month: frequency === "Yearly" ? 1 : null,
      });
      const last = date("9999-12-31");

      const next = nextOccurrence(rule, last, last);

      expect(next).toBeNull();
    },
  );

  it("A date after 9999 ends the rule", () => {
    const start = date("9999-12-30");

    const next = nextOccurrence(recurrenceRule("Daily", { interval: 2 }), start, start);

    expect(next).toBeNull();
  });

  it("Refuses an invalid rule", () => {
    const start = date("2026-11-13");

    const calculate = () => nextOccurrence(recurrenceRule("Weekly"), start, start);

    expect(calculate).toThrow(MetadataRuleError);
  });
});
