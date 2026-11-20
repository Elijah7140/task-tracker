import { foldSearchText } from "../text-folding.js";

const MAX_RELATIVE_UNITS = 5000;
const ISO_DATE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const OFFSET = /^([+-])([0-9]+)(.)$/;
const MIN_DATE = Temporal.PlainDate.from("0001-01-01");
const MAX_DATE = Temporal.PlainDate.from("9999-12-31");
const KEYWORD_OFFSETS = new Map([
  ["today", 0],
  ["tomorrow", 1],
  ["yesterday", -1],
]);
const UNIT_DAYS = new Map([
  ["d", 1],
  ["w", 7],
]);

/** True when `date` lies in the legacy `DateOnly` range, years 1 to 9999. */
export function isInQueryDateDomain(date: Temporal.PlainDate): boolean {
  return (
    Temporal.PlainDate.compare(date, MIN_DATE) >= 0 &&
    Temporal.PlainDate.compare(date, MAX_DATE) <= 0
  );
}

function addDays(today: Temporal.PlainDate, days: number): Temporal.PlainDate | null {
  const date = today.add({ days });
  return isInQueryDateDomain(date) ? date : null;
}

function readIsoDate(value: string): Temporal.PlainDate | null {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  const daysInMonth = Temporal.PlainYearMonth.from({ year, month }).daysInMonth;
  return day <= daysInMonth ? Temporal.PlainDate.from({ year, month, day }) : null;
}

function readOffset(value: string, today: Temporal.PlainDate): Temporal.PlainDate | null {
  const match = OFFSET.exec(value);
  const daysPerUnit = match === null ? undefined : UNIT_DAYS.get(match[3]!.toLowerCase());
  if (match === null || daysPerUnit === undefined) {
    return null;
  }
  const amount = Number(match[2]);
  if (amount > MAX_RELATIVE_UNITS) {
    return null;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return addDays(today, sign * amount * daysPerUnit);
}

/**
 * Reads a query date relative to `today`: `yyyy-MM-dd`, `today`, `tomorrow`,
 * `yesterday`, or an offset in days or weeks such as `+3d` or `-1w`. Returns null
 * for other text or a date outside years 1 to 9999 (§7.7).
 */
export function readQueryDate(value: string, today: Temporal.PlainDate): Temporal.PlainDate | null {
  const keywordOffset = KEYWORD_OFFSETS.get(foldSearchText(value));
  if (keywordOffset !== undefined) {
    return addDays(today, keywordOffset);
  }
  return readIsoDate(value) ?? readOffset(value, today);
}
