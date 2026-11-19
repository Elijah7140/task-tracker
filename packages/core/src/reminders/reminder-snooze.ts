import { toFloating, toUtc } from "../time/floating-time.js";

/** The ways a delivered reminder can be deferred from the panel (§7.12). */
export const REMINDER_SNOOZES = ["tenMinutes", "oneHour", "tomorrow"] as const;

/** One of {@link REMINDER_SNOOZES}. */
export type ReminderSnooze = (typeof REMINDER_SNOOZES)[number];

/**
 * When a snoozed reminder is due again: ten minutes or an hour from now, or
 * tomorrow, by the server zone's calendar, at the date-only reminder time.
 */
export function snoozeUntil(
  option: ReminderSnooze,
  now: Temporal.Instant,
  timeZone: string,
  tomorrowTime: Temporal.PlainTime,
): Temporal.Instant {
  switch (option) {
    case "tenMinutes":
      return now.add({ minutes: 10 });
    case "oneHour":
      return now.add({ hours: 1 });
    case "tomorrow": {
      const tomorrow = toFloating(now, timeZone).toPlainDate().add({ days: 1 });
      return toUtc(tomorrow.toPlainDateTime(tomorrowTime), timeZone);
    }
  }
}
