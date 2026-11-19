import { describe, expect, it } from "@effect/vitest";
import {
  describeRecurrence,
  findRecurrenceError,
  RecurrenceWeekday,
  recurrenceRule,
  sameRecurrence,
  type RecurrenceRule,
} from "../../../src/index.js";

const invalidRules: ReadonlyArray<readonly [string, RecurrenceRule, string]> = [
  [
    "an unknown frequency",
    { ...recurrenceRule("Daily"), frequency: "Hourly" as never },
    "frequency",
  ],
  ["a zero interval", recurrenceRule("Daily", { interval: 0 }), "interval"],
  ["a fractional interval", recurrenceRule("Daily", { interval: 1.5 }), "interval"],
  ["weekly without weekdays", recurrenceRule("Weekly"), "weekdays"],
  ["weekly with an unknown day bit", recurrenceRule("Weekly", { weekdays: 128 }), "weekdays"],
  [
    "daily with weekdays",
    recurrenceRule("Daily", { weekdays: RecurrenceWeekday.Monday }),
    "weekdays",
  ],
  ["monthly on day 32", recurrenceRule("Monthly", { monthDay: 32 }), "monthDay"],
  ["yearly on 30 February", recurrenceRule("Yearly", { monthDay: 30, month: 2 }), "monthDay"],
  ["yearly in month 13", recurrenceRule("Yearly", { monthDay: 1, month: 13 }), "month"],
  ["an unknown anchor", recurrenceRule("Daily", { anchor: "Start" as never }), "anchor"],
  ["an unknown end kind", recurrenceRule("Daily", { endKind: "Later" as never }), "endKind"],
  ["a zero count", recurrenceRule("Daily", { endKind: "AfterCount", remaining: 0 }), "remaining"],
  ["an end date missing", recurrenceRule("Daily", { endKind: "OnDate" }), "endDate"],
];

describe("recurrence rule validation", () => {
  it.each(invalidRules)("Identifies %s", (_name, rule, property) => {
    const failure = findRecurrenceError(rule);

    expect(failure?.property).toBe(property);
  });

  it("Accepts each frequency with its pattern", () => {
    const rules = [
      recurrenceRule("Daily", { interval: 3 }),
      recurrenceRule("Weekly", { weekdays: RecurrenceWeekday.Friday }),
      recurrenceRule("Monthly", { monthDay: 0 }),
      recurrenceRule("Yearly", { monthDay: 29, month: 2 }),
    ];

    const failures = rules.map(findRecurrenceError);

    expect(failures).toEqual([null, null, null, null]);
  });
});

describe("recurrence rule descriptions", () => {
  it("Presents weekdays, month end and a leap day", () => {
    const weekly = recurrenceRule("Weekly", {
      interval: 2,
      weekdays: RecurrenceWeekday.Monday | RecurrenceWeekday.Thursday,
    });
    const monthly = recurrenceRule("Monthly", { monthDay: 0 });
    const yearly = recurrenceRule("Yearly", { monthDay: 29, month: 2 });

    const descriptions = [weekly, monthly, yearly].map(describeRecurrence);

    expect(descriptions).toEqual([
      "Every 2 weeks on Mon, Thu",
      "Monthly on the last day",
      "Every year on 29 Feb",
    ]);
  });

  it("Names single and repeated intervals", () => {
    const rules = [
      recurrenceRule("Daily"),
      recurrenceRule("Daily", { interval: 3 }),
      recurrenceRule("Monthly", { interval: 2, monthDay: 15 }),
      recurrenceRule("Yearly", { interval: 4, monthDay: 1, month: 12 }),
    ];

    const descriptions = rules.map(describeRecurrence);

    expect(descriptions).toEqual([
      "Daily",
      "Every 3 days",
      "Every 2 months on day 15",
      "Every 4 years on 1 Dec",
    ]);
  });
});

describe("recurrence rule equality", () => {
  it("Compares every property including the end date", () => {
    const rule = recurrenceRule("Daily", {
      endKind: "OnDate",
      endDate: Temporal.PlainDate.from("2026-12-01"),
    });

    const same = sameRecurrence(rule, { ...rule, endDate: Temporal.PlainDate.from("2026-12-01") });
    const later = sameRecurrence(rule, { ...rule, endDate: Temporal.PlainDate.from("2026-12-02") });

    expect([same, later, sameRecurrence(null, null), sameRecurrence(rule, null)]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
