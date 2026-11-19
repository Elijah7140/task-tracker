import { SettingsCatalogue } from "../settings/settings-catalogue.js";
import { ticksPerDay, ticksPerMinute, type DurationTicks } from "../time/duration-ticks.js";
import { toFloating } from "../time/floating-time.js";
import { REMINDER_OFFSET_MINUTES } from "./reminder-choice.js";
import { parseOrDefault } from "./reminder-settings.js";

const itemMaximum = BigInt(Math.max(...REMINDER_OFFSET_MINUTES)) * ticksPerMinute;
const lastDate = Temporal.PlainDate.from("9999-12-31");

/**
 * The largest offset any item can use: the one-week item maximum, the default,
 * or any larger stored default offset text. Malformed text counts as the default.
 */
export function largestReminderOffset(storedDefaults: readonly string[]): DurationTicks {
  const definition = SettingsCatalogue.defaultReminderOffset;
  return storedDefaults
    .map((text) => parseOrDefault(definition, text))
    .reduce((largest, offset) => (offset > largest ? offset : largest), itemMaximum);
}

/**
 * The latest due date that can have a reminder at or before `now`: the local
 * date plus the largest offset in whole days, plus one day of zone slack. The
 * due query skips later items before resolving any instant (§7.12).
 */
export function reminderDueHorizon(
  now: Temporal.Instant,
  timeZone: string,
  largestOffset: DurationTicks,
): Temporal.PlainDate {
  const today = toFloating(now, timeZone).toPlainDate();
  const days = (largestOffset + ticksPerDay - 1n) / ticksPerDay + 1n;
  const remaining = BigInt(today.until(lastDate).days);
  return today.add({ days: Number(days < remaining ? days : remaining) });
}
