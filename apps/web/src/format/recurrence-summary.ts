import type { RecurrenceRule } from "@task-tracker/contracts";

/** A repeat rule as the server sends it (§7.11). */
export type RepeatRule = typeof RecurrenceRule.Type;

/** Short day names in Monday-first order, matching the weekday bit flags. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function interval(rule: RepeatRule, single: string, plural: string) {
  return rule.interval === 1 ? single : `Every ${rule.interval} ${plural}`;
}

function weekdays(rule: RepeatRule) {
  const flags = rule.weekdays ?? 0;
  return WEEKDAY_LABELS.filter((_label, index) => (flags & (1 << index)) !== 0).join(", ");
}

/**
 * Describes a rule in the same plain English as the server's CSV column and the
 * legacy marker tooltip, such as "Every 2 weeks on Mon, Thu".
 */
export function describeRepeat(rule: RepeatRule): string {
  switch (rule.frequency) {
    case "Daily":
      return interval(rule, "Daily", "days");
    case "Weekly":
      return `${interval(rule, "Weekly", "weeks")} on ${weekdays(rule)}`;
    case "Monthly": {
      const day = rule.monthDay === 0 ? "the last day" : `day ${rule.monthDay}`;
      return `${interval(rule, "Monthly", "months")} on ${day}`;
    }
    case "Yearly":
      return `${interval(rule, "Every year", "years")} on ${rule.monthDay} ${MONTH_LABELS[(rule.month ?? 1) - 1]}`;
  }
}

/**
 * The Monday-first day of the week (Monday 1 … Sunday 7) of an ISO calendar date,
 * computed from the date itself so no clock or zone is involved.
 */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  // Days from 1970-01-01 by Howard Hinnant's days_from_civil; that day was a Thursday.
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  const days = era * 146097 + dayOfEra - 719468;
  return ((((days + 3) % 7) + 7) % 7) + 1;
}
