import {
  addDays,
  addMonths,
  firstOfMonth,
  formatIsoDateInZone,
  monthRange,
  parseIsoDate,
  startOfWeek,
} from "../calendar/calendar-dates.js";
import { MONTH_DAY_COUNT } from "../calendar/calendar-metrics.js";

const TYPED_DATE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/;

/**
 * Reads a typed date as `YYYY-MM-DD`, accepting one-digit months and days.
 * Returns `""` for blank text and `null` for text that is not a real date.
 */
export function parseTypedDate(text: string): string | null {
  if (text.trim() === "") {
    return "";
  }
  const match = TYPED_DATE.exec(text);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const iso = formatIsoDateInZone(Date.UTC(year, month - 1, day), "UTC");
  const padded = `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return iso === padded ? iso : null;
}

/** The 42 days of the six-week grid showing `month`, starting on `weekStartsOn`. */
export function pickerMonthDays(month: string, weekStartsOn: number): ReadonlyArray<string> {
  const { fromDate } = monthRange(month, weekStartsOn);
  return Array.from({ length: MONTH_DAY_COUNT }, (_, index) => addDays(fromDate, index));
}

/** Number of days in `isoDate`'s month. */
function daysInMonth(isoDate: string): number {
  return parseIsoDate(addDays(addMonths(isoDate, 1), -1)).day;
}

/** Moves `isoDate` by whole months, keeping the day number but never overflowing a short month. */
export function shiftMonths(isoDate: string, months: number): string {
  const first = addMonths(isoDate, months);
  const day = Math.min(parseIsoDate(isoDate).day, daysInMonth(first));
  return addDays(first, day - 1);
}

/** True when `isoDate` falls in the month that starts on `month`. */
export function isInMonth(isoDate: string, month: string): boolean {
  return firstOfMonth(isoDate) === firstOfMonth(month);
}

/** A key press on a focused day, with only the modifier the picker uses. */
export interface PickerKey {
  readonly key: string;
  readonly shiftKey: boolean;
}

const DAY_STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * The day a navigation key moves focus to from `focused`, or `null` for other keys.
 * Arrows move by day and week, PageUp and PageDown by month (by year with Shift),
 * and Home and End to the start and end of the week.
 */
export function pickerKeyTarget(
  { key, shiftKey }: PickerKey,
  focused: string,
  weekStartsOn: number,
): string | null {
  const dayStep = DAY_STEPS[key];
  if (dayStep !== undefined) {
    return addDays(focused, dayStep);
  }
  const monthStep = shiftKey ? 12 : 1;
  switch (key) {
    case "PageUp":
      return shiftMonths(focused, -monthStep);
    case "PageDown":
      return shiftMonths(focused, monthStep);
    case "Home":
      return startOfWeek(focused, weekStartsOn);
    case "End":
      return addDays(startOfWeek(focused, weekStartsOn), 6);
    default:
      return null;
  }
}
