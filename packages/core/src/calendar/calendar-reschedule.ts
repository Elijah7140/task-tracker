import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { CalendarEntry } from "./calendar-entry.js";

type Dates = Pick<CalendarEntry, "dueDate" | "dueTime">;

type Target =
  | { readonly type: "month" | "all-day"; readonly date: string }
  | { readonly type: "time"; readonly date: string; readonly minute: number }
  | { readonly type: "step"; readonly days: number; readonly quarters: number };

/** Pointer drop or keyboard move of a stored item's due entry. */
export interface CalendarMoveIntent {
  readonly target: Target;
}

const QUARTER = 15;
const LAST_QUARTER = 24 * 60 - QUARTER;

function checkedDate(date: Temporal.PlainDate): Temporal.PlainDate {
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

/** Plan a due-date change against the latest dates in floating time. */
export function planCalendarMove(dates: Dates, move: CalendarMoveIntent) {
  // Pick only the calendar fields even when the caller passes a complete item.
  const { dueDate, dueTime } = dates;
  return moveDue({ dueDate, dueTime }, move.target);
}
