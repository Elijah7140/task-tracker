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

const US_DATE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
const ISO_DATE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/;

/** The year, month and day of typed `MM/DD/YYYY` text, or of `YYYY-MM-DD` text. */
function typedParts(text: string) {
  const us = US_DATE.exec(text);
  if (us !== null) {
    return { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) };
  }
  const iso = ISO_DATE.exec(text);
  if (iso !== null) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  return null;
}

/**
 * Reads a typed date as `MM/DD/YYYY` (the owner's preference), also accepting
 * one-digit months and days and `YYYY-MM-DD`. Returns the `YYYY-MM-DD` value,
 * `""` for blank text and `null` for text that is not a real date.
 */
export function parseTypedDate(text: string): string | null {
  if (text.trim() === "") {
    return "";
  }
  const parts = typedParts(text);
  if (parts === null) {
    return null;
  }
  const { year, month, day } = parts;
  const iso = formatIsoDateInZone(Date.UTC(year, month - 1, day), "UTC");
  const padded = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return iso === padded ? iso : null;
}

/** Shows a `YYYY-MM-DD` value as `MM/DD/YYYY`; `""` stays blank. */
export function formatTypedDate(isoDate: string): string {
  if (isoDate === "") {
    return "";
  }
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
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
