import { toFloating, toUtc } from "../time/floating-time.js";

/** One local calendar day as a UTC interval, start inclusive and end exclusive (§5.4, §7.14). */
export interface LocalDayWindow {
  readonly day: Temporal.PlainDate;
  readonly startUtc: Temporal.Instant;
  readonly endUtc: Temporal.Instant;
}

const midnight = Temporal.PlainTime.from("00:00");

function midnightUtc(day: Temporal.PlainDate, timeZone: string): Temporal.Instant {
  return toUtc(day.toPlainDateTime(midnight), timeZone);
}

/** The calendar date that `now` falls on in the supplied zone. */
export function currentLocalDay(now: Temporal.Instant, timeZone: string): Temporal.PlainDate {
  return toFloating(now, timeZone).toPlainDate();
}

/**
 * The UTC bounds of `day` in the supplied zone. Each bound is that day's local
 * midnight, resolved to the transition when midnight falls in a gap, so
 * consecutive days share their boundary and DST days last 23 or 25 hours.
 */
export function localDayWindow(day: Temporal.PlainDate, timeZone: string): LocalDayWindow {
  return {
    day,
    startUtc: midnightUtc(day, timeZone),
    endUtc: midnightUtc(day.add({ days: 1 }), timeZone),
  };
}
