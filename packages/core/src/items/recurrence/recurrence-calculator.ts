import { MetadataRuleError } from "../../metadata/metadata-rule-error.js";
import { findRecurrenceError, type RecurrenceRule } from "./recurrence-rule.js";
import { includesWeekday } from "./recurrence-weekday.js";

/** The last calendar date the legacy `DateOnly` storage could hold. */
const LAST_DATE = Temporal.PlainDate.from("9999-12-31");
const FIRST_DATE = Temporal.PlainDate.from("0001-01-01");

/** Whether a date fits the four-digit years that storage and legacy files use. */
export function isSupportedDate(date: Temporal.PlainDate): boolean {
  return (
    Temporal.PlainDate.compare(date, FIRST_DATE) >= 0 &&
    Temporal.PlainDate.compare(date, LAST_DATE) <= 0
  );
}

/**
 * Calculates one next occurrence using only floating calendar dates (§7.11).
 * Returns null when the rule is exhausted, the end date passes, or the next
 * date falls outside the supported calendar.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  scheduledDate: Temporal.PlainDate,
  completionDate: Temporal.PlainDate,
): Temporal.PlainDate | null {
  const error = findRecurrenceError(rule);
  if (error !== null) {
    throw new MetadataRuleError(error.message);
  }
  if (rule.remaining === 1) {
    return null;
  }
  const anchor = rule.anchor === "DueDate" ? scheduledDate : completionDate;
  const next = advance(rule, anchor);
  if (next === null || !isSupportedDate(next)) {
    return null;
  }
  return rule.endDate !== null && Temporal.PlainDate.compare(next, rule.endDate) > 0 ? null : next;
}

function advance(rule: RecurrenceRule, anchor: Temporal.PlainDate): Temporal.PlainDate | null {
  try {
    switch (rule.frequency) {
      case "Daily":
        return anchor.add({ days: rule.interval });
      case "Weekly":
        return nextWeekday(anchor, rule.interval, rule.weekdays!);
      case "Monthly":
        return inMonth(anchor.toPlainYearMonth().add({ months: rule.interval }), rule.monthDay!);
      case "Yearly": {
        const month = Temporal.PlainYearMonth.from({ year: anchor.year, month: rule.month! });
        return inMonth(month.add({ years: rule.interval }), rule.monthDay!);
      }
    }
  } catch (error) {
    if (error instanceof RangeError) {
      return null;
    }
    throw error;
  }
}

/** The next selected day later in the anchor's Monday-first week, else in `interval` weeks. */
function nextWeekday(
  anchor: Temporal.PlainDate,
  interval: number,
  weekdays: number,
): Temporal.PlainDate {
  const anchorIndex = anchor.dayOfWeek - 1;
  for (let index = anchorIndex + 1; index < 7; index++) {
    if (includesWeekday(weekdays, index)) {
      return anchor.add({ days: index - anchorIndex });
    }
  }
  const firstIndex = [0, 1, 2, 3, 4, 5, 6].find((index) => includesWeekday(weekdays, index))!;
  return anchor.add({ days: 7 * interval + firstIndex - anchorIndex });
}

/** The requested day in a month, clamped to its last day; 0 selects the last day. */
function inMonth(month: Temporal.PlainYearMonth, day: number): Temporal.PlainDate {
  const lastDay = month.daysInMonth;
  return month.toPlainDate({ day: day === 0 ? lastDay : Math.min(day, lastDay) });
}
