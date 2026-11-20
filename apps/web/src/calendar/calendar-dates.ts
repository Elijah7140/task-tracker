import { MONTH_DAY_COUNT, WEEK_DAY_COUNT } from "./calendar-metrics.js";

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parsed Gregorian calendar date components. */
export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Splits an `YYYY-MM-DD` string into numeric year, month (1–12), and day (1–31). */
export function parseIsoDate(isoDate: string): DateParts {
  const match = ISO_DATE_PARTS.exec(isoDate);
  if (match === null) {
    throw new RangeError(`Invalid ISO date: ${isoDate}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** UTC epoch milliseconds at 00:00:00Z for a floating calendar date. */
export function isoDateToUtcMillis(isoDate: string): number {
  const { year, month, day } = parseIsoDate(isoDate);
  return Date.UTC(year, month - 1, day);
}

/** Formats an epoch millisecond instant as `YYYY-MM-DD` in the explicit IANA `timeZone`. */
export function formatIsoDateInZone(epochMillis: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(epochMillis);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Returns the ISO date `days` after (or before, if negative) `isoDate`. */
export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  return formatIsoDateInZone(Date.UTC(year, month - 1, day + days), "UTC");
}

/** Returns the first day (`YYYY-MM-01`) of `isoDate`'s month. */
export function firstOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Moves from the first day of `isoDate`'s month by `months`, never skipping short months (§7.4). */
export function addMonths(isoDate: string, months: number): string {
  const { year, month } = parseIsoDate(isoDate);
  return formatIsoDateInZone(Date.UTC(year, month - 1 + months, 1), "UTC");
}

/** Day of week for `isoDate`: 0 = Sunday through 6 = Saturday. */
export function dayOfWeek(isoDate: string): number {
  const daysSinceEpoch = Math.floor(isoDateToUtcMillis(isoDate) / MS_PER_DAY);
  return (((daysSinceEpoch + 4) % 7) + 7) % 7;
}

/** Returns the locale's first day of week (0 = Sunday .. 6 = Saturday), defaulting to Sunday. */
export function firstDayOfWeek(locale?: string): number {
  try {
    const resolved = locale ?? navigator.language;
    const loc = new Intl.Locale(resolved) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = typeof loc.getWeekInfo === "function" ? loc.getWeekInfo() : loc.weekInfo;
    if (info !== undefined && info.firstDay >= 1 && info.firstDay <= 7) {
      return info.firstDay % 7;
    }
  } catch {
    // Fallback to Sunday when Intl.Locale weekInfo is unavailable.
  }
  return 0;
}

/** Returns the first day of the week containing `isoDate`. */
export function startOfWeek(isoDate: string, weekStartsOn: number): string {
  const offset = (dayOfWeek(isoDate) - weekStartsOn + 7) % 7;
  return addDays(isoDate, -offset);
}

/** Inclusive-start, exclusive-end 42-day range for a six-week month view. */
export function monthRange(anchor: string, weekStartsOn: number) {
  const fromDate = startOfWeek(firstOfMonth(anchor), weekStartsOn);
  return { fromDate, toDateExclusive: addDays(fromDate, MONTH_DAY_COUNT) };
}

/** Inclusive-start, exclusive-end 7-day range for a week view. */
export function weekRange(anchor: string, weekStartsOn: number) {
  const fromDate = startOfWeek(anchor, weekStartsOn);
  return { fromDate, toDateExclusive: addDays(fromDate, WEEK_DAY_COUNT) };
}

/** Formats a month title such as `"November 2026"`. */
export function formatMonthTitle(anchor: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(isoDateToUtcMillis(firstOfMonth(anchor)));
}

function monthDayFormat(locale: string | undefined) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** True when the locale writes the day before the month, as in "16. Nov.". */
function isDayFirst(locale: string | undefined): boolean {
  const types = monthDayFormat(locale)
    .formatToParts(0)
    .map((part) => part.type);
  return types.indexOf("day") < types.indexOf("month");
}

/** The day number with the locale's trailing day punctuation, such as "16." in German. */
function dayOnly(isoDate: string, locale: string | undefined): string {
  const parts = monthDayFormat(locale).formatToParts(isoDateToUtcMillis(isoDate));
  const dayIndex = parts.findIndex((part) => part.type === "day");
  const following = parts[dayIndex + 1];
  const suffix = following?.type === "literal" ? following.value.trim() : "";
  return `${parts[dayIndex]?.value ?? ""}${suffix}`;
}

function shortMonth(isoDate: string, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
    isoDateToUtcMillis(isoDate),
  );
}

/**
 * Formats a seven-day week title in the locale's date order, such as
 * "Nov 15 – 21, 2026" or "16. – 22. Nov. 2026". Names both months, or both
 * years, when the week spans them.
 */
export function formatWeekTitle(first: string, locale?: string): string {
  const last = addDays(first, 6);
  const firstParts = parseIsoDate(first);
  const lastParts = parseIsoDate(last);
  const monthDay = (isoDate: string) => monthDayFormat(locale).format(isoDateToUtcMillis(isoDate));
  const dayFirst = isDayFirst(locale);
  if (firstParts.year !== lastParts.year) {
    return `${monthDay(first)}, ${firstParts.year} – ${monthDay(last)}, ${lastParts.year}`;
  }
  const sameMonth = firstParts.month === lastParts.month;
  if (dayFirst && sameMonth) {
    const month = shortMonth(last, locale);
    return `${dayOnly(first, locale)} – ${dayOnly(last, locale)} ${month} ${lastParts.year}`;
  }
  const lastLabel = sameMonth ? dayOnly(last, locale) : monthDay(last);
  const separator = dayFirst ? " " : ", ";
  return `${monthDay(first)} – ${lastLabel}${separator}${lastParts.year}`;
}

/** Names a whole day for screen readers, such as "Monday, November 16, 2026". */
export function formatDayName(isoDate: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(
    isoDateToUtcMillis(isoDate),
  );
}

/** Formats a single day column header such as `"Sun 15"`. */
export function formatDayHeader(isoDate: string, locale?: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
    isoDateToUtcMillis(isoDate),
  );
  return `${weekday} ${parseIsoDate(isoDate).day}`;
}

/** Short weekday labels starting from `weekStartsOn` (e.g. Sun..Sat). */
export function weekdayHeaders(weekStartsOn: number, locale?: string): ReadonlyArray<string> {
  // 2026-11-15 is a Sunday.
  const sunday = "2026-11-15";
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(isoDateToUtcMillis(addDays(sunday, (weekStartsOn + index) % 7))),
  );
}
