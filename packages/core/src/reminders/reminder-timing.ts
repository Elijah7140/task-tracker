import type { TodoItem } from "../items/todo-item.js";
import { ticksPerMinute, ticksPerSecond, type DurationTicks } from "../time/duration-ticks.js";
import { toUtc } from "../time/floating-time.js";
import { SettingsCatalogue } from "../settings/settings-catalogue.js";
import { parseOrDefault, type ReminderSettings } from "./reminder-settings.js";

const earliestLocal = Temporal.PlainDateTime.from("0001-01-01T00:00");

/** The item state that decides whether and when it reminds. */
export type ReminderItem = Pick<
  TodoItem,
  "completedAtUtc" | "deletedAtUtc" | "dueDate" | "dueTime" | "reminder"
>;

/** A snooze applies only while the base instant it deferred is unchanged. */
export interface ReminderSnoozeState {
  readonly snoozedForUtc: Temporal.Instant | null;
  readonly snoozedUntilUtc: Temporal.Instant | null;
}

function subtractTicks(local: Temporal.PlainDateTime, offset: DurationTicks) {
  const seconds = Number(offset / ticksPerSecond);
  const nanoseconds = Number((offset % ticksPerSecond) * 100n);
  try {
    const shifted = local.subtract({ seconds, nanoseconds });
    return Temporal.PlainDateTime.compare(shifted, earliestLocal) < 0 ? earliestLocal : shifted;
  } catch {
    return earliestLocal;
  }
}

/**
 * The reminder instant for a floating due moment. The offset is subtracted in
 * local time, then a gap resolves to the first valid instant and a repeated
 * hour to the earlier one (§5.4).
 */
export function reminderBaseInstant(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  offset: DurationTicks,
  timeZone: string,
): Temporal.Instant {
  return toUtc(subtractTicks(date.toPlainDateTime(time), offset), timeZone);
}

/**
 * The computed reminder instant of an item, before any snooze, or null when it
 * does not remind: done, deleted, undated, set to None or with reminders off.
 */
export function itemReminderBase(
  item: ReminderItem,
  settings: ReminderSettings,
  timeZone: string,
): Temporal.Instant | null {
  const { dueDate, reminder } = item;
  if (
    item.completedAtUtc !== null ||
    item.deletedAtUtc !== null ||
    dueDate === null ||
    reminder.kind === "none" ||
    !settings.remindersEnabled.value
  ) {
    return null;
  }
  const time = item.dueTime ?? settings.dateOnlyReminderTime.value;
  const offset =
    reminder.kind === "offset"
      ? BigInt(reminder.minutes) * ticksPerMinute
      : settings.defaultReminderOffset.value;
  return reminderBaseInstant(dueDate, time, offset, timeZone);
}

/** The instant that is due: a snooze replaces the base instant it deferred, once. */
export function itemReminderInstant(
  base: Temporal.Instant | null,
  snooze: ReminderSnoozeState,
): Temporal.Instant | null {
  if (base === null || snooze.snoozedForUtc === null || !base.equals(snooze.snoozedForUtc)) {
    return base;
  }
  return snooze.snoozedUntilUtc ?? base;
}

/** Due once the instant has passed, unless that same instant was already delivered. */
export function isReminderDue(
  instant: Temporal.Instant,
  now: Temporal.Instant,
  deliveredFor: Temporal.Instant | null,
): boolean {
  const delivered = deliveredFor !== null && instant.equals(deliveredFor);
  return Temporal.Instant.compare(instant, now) <= 0 && !delivered;
}

/** Stored reminder inputs as the database holds them, before any parsing. */
export interface StoredReminderInputs {
  readonly dueDate: string;
  /** The due time, or else the effective date-only reminder time text. */
  readonly time: string;
  /** The item's explicit offset; null uses `defaultOffset`. */
  readonly offsetMinutes: number | null;
  /** The effective default offset text. */
  readonly defaultOffset: string;
}

/**
 * The base instant for stored values, used by the scheduler's due query. A
 * malformed time or default offset falls back to its setting's default for
 * that row; an unreadable due date has no reminder.
 */
export function storedReminderBase(
  inputs: StoredReminderInputs,
  timeZone: string,
): Temporal.Instant | null {
  let date: Temporal.PlainDate;
  try {
    date = Temporal.PlainDate.from(inputs.dueDate, { overflow: "reject" });
  } catch {
    return null;
  }
  const time = parseOrDefault(SettingsCatalogue.dateOnlyReminderTime, inputs.time);
  const offset =
    inputs.offsetMinutes === null
      ? parseOrDefault(SettingsCatalogue.defaultReminderOffset, inputs.defaultOffset)
      : BigInt(inputs.offsetMinutes) * ticksPerMinute;
  return reminderBaseInstant(date, time, offset, timeZone);
}
