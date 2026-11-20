import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { effectiveScheduledEnd, type CalendarEntry } from "./calendar-entry.js";

type Dates = Pick<CalendarEntry, "dueDate" | "dueTime" | "scheduledStart" | "scheduledEnd">;

type Target =
  | { readonly type: "month" | "all-day"; readonly date: string }
  | { readonly type: "time"; readonly date: string; readonly minute: number }
  | { readonly type: "step"; readonly days: number; readonly quarters: number };

/** Pointer drop or keyboard move for an occurrence of a stored calendar entry. */
export interface CalendarMoveIntent {
  readonly kind: CalendarEntry["kind"];
  readonly sourceDay: string;
  readonly target: Target;
}

const QUARTER = 15;
const LAST_QUARTER = 24 * 60 - QUARTER;

function checkedDate<T extends Temporal.PlainDate | Temporal.PlainDateTime>(date: T): T {
  if (date.year < 1 || date.year > 9999) {
    throw new MetadataRuleError("The new date is beyond the supported dates.");
  }
  return date;
}

function atMinute(minute: number): Temporal.PlainTime {
  return new Temporal.PlainTime(Math.floor(minute / 60), minute % 60);
}

function nudge(time: Temporal.PlainTime | null, quarters: number): Temporal.PlainTime | null {
  if (time === null || quarters === 0) {
    return time;
  }
  const minute = time.hour * 60 + time.minute;
  const floor = minute - (minute % QUARTER);
  const betweenQuarters = !time.equals(atMinute(floor));
  const origin = quarters < 0 && betweenQuarters ? floor + QUARTER : floor;
  return atMinute(Math.max(0, Math.min(LAST_QUARTER, origin + quarters * QUARTER)));
}

function destination(date: Temporal.PlainDate, time: Temporal.PlainTime | null, target: Target) {
  if (target.type === "step") {
    // No date in the supported four-digit years can move this many days.
    if (Math.abs(target.days) >= 3_660_000) {
      throw new MetadataRuleError("The new date is beyond the supported dates.");
    }
    return {
      date: checkedDate(date.add({ days: target.days })),
      time: nudge(time, target.quarters),
    };
  }
  if (target.type === "time") {
    if (target.minute < 0 || target.minute > LAST_QUARTER || target.minute % QUARTER !== 0) {
      throw new MetadataRuleError("Choose a quarter-hour time within the day.");
    }
    return {
      date: checkedDate(Temporal.PlainDate.from(target.date)),
      time: atMinute(target.minute),
    };
  }
  return {
    date: checkedDate(Temporal.PlainDate.from(target.date)),
    time: target.type === "month" ? time : null,
  };
}

function moveDue(dates: Dates, target: Target) {
  const { dueDate, dueTime } = dates;
  if (dueDate === null) {
    throw new MetadataRuleError("Item has no due date to move.");
  }
  const { date, time } = destination(dueDate, dueTime, target);
  if (dueDate.equals(date) && (time === null ? dueTime === null : dueTime?.equals(time))) {
    return null;
  }
  return { dates: { ...dates, dueDate: date, dueTime: time }, date };
}

/** The continuation starts at midnight, if that day still overlaps the current block. */
function occurrenceStart(
  start: Temporal.PlainDateTime,
  end: Temporal.PlainDateTime | null,
  sourceDay: string,
) {
  const midnight = Temporal.PlainDate.from(sourceDay).toPlainDateTime();
  const effectiveEnd = effectiveScheduledEnd(start, end)!;
  return Temporal.PlainDateTime.compare(start, midnight) < 0 &&
    Temporal.PlainDateTime.compare(midnight, effectiveEnd) < 0
    ? midnight
    : start;
}

function moveSchedule(dates: Dates, { sourceDay, target }: CalendarMoveIntent) {
  const { scheduledStart, scheduledEnd } = dates;
  if (scheduledStart === null) {
    throw new MetadataRuleError("Item has no schedule to move.");
  }
  if (target.type === "all-day") {
    return null;
  }
  const source = occurrenceStart(scheduledStart, scheduledEnd, sourceDay);
  const { date, time } = destination(source.toPlainDate(), source.toPlainTime(), target);
  const shift = source.until(date.toPlainDateTime(time!), { largestUnit: "day" });
  if (shift.blank) {
    return null;
  }
  const start = checkedDate(scheduledStart.add(shift));
  const end = scheduledEnd === null ? null : checkedDate(scheduledEnd.add(shift));
  return {
    dates: { ...dates, scheduledStart: start, scheduledEnd: end },
    date: start.toPlainDate(),
  };
}

/** Plan a change against the latest dates in floating time, retaining any exact duration. */
export function planCalendarMove(dates: Dates, move: CalendarMoveIntent) {
  // Pick only the calendar fields even when the caller passes a complete item.
  const { dueDate, dueTime, scheduledStart, scheduledEnd } = dates;
  const calendarDates = { dueDate, dueTime, scheduledStart, scheduledEnd };
  return move.kind === "due"
    ? moveDue(calendarDates, move.target)
    : moveSchedule(calendarDates, move);
}
