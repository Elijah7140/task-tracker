import type { GlobalSettings, ReminderDefaults } from "@task-tracker/contracts";
import { REMINDER_OFFSETS } from "../editor/reminder-draft.js";

type Defaults = typeof ReminderDefaults.Type;

const TICKS_PER_MINUTE = 600_000_000n;
const TIME_PATTERN = /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/;

/** The reminder defaults of a database that stores none (§7.12). */
export const DEFAULT_REMINDER_DEFAULTS: Defaults = {
  remindersEnabled: true,
  defaultReminderOffset: String(60n * TICKS_PER_MINUTE),
  dateOnlyReminderTime: "09:00:00",
};

/** Shown when the date-only reminder time box does not hold a time. */
export const REMINDER_TIME_ERROR = "Choose the date-only reminder time.";

/** The reminder fields of a settings form: on or off, offset ticks and the time box text. */
export interface ReminderDefaultsDraft {
  readonly enabled: boolean;
  readonly offset: string;
  readonly time: string;
}

/** The global reminder defaults, falling back for a server that sent none. */
export function reminderDefaultsOf(settings: typeof GlobalSettings.Type): Defaults {
  return settings.reminders ?? DEFAULT_REMINDER_DEFAULTS;
}

/** Shows whole minutes as `HH:mm`, keeping seconds that are set. */
export function displayTime(time: string): string {
  return time.length > 5 && time.endsWith(":00") ? time.slice(0, 5) : time;
}

/** The `HH:mm:ss` form of time box text, or null when it is not a time. */
export function normalizeTime(text: string): string | null {
  if (!TIME_PATTERN.test(text)) {
    return null;
  }
  return text.length === 5 ? `${text}:00` : text;
}

/** The form fields for saved reminder defaults. */
export function reminderDraftFrom(defaults: Defaults): ReminderDefaultsDraft {
  return {
    enabled: defaults.remindersEnabled,
    offset: defaults.defaultReminderOffset,
    time: displayTime(defaults.dateOnlyReminderTime),
  };
}

/** The defaults the fields would save, or null while the time is not a time. */
export function reminderDefaultsFrom(draft: ReminderDefaultsDraft): Defaults | null {
  const time = normalizeTime(draft.time);
  return time === null
    ? null
    : {
        remindersEnabled: draft.enabled,
        defaultReminderOffset: draft.offset,
        dateOnlyReminderTime: time,
      };
}

/** Whether two sets of defaults remind in the same way. */
export function sameReminderDefaults(left: Defaults, right: Defaults): boolean {
  return (
    left.remindersEnabled === right.remindersEnabled &&
    left.defaultReminderOffset === right.defaultReminderOffset &&
    normalizeTime(left.dateOnlyReminderTime) === normalizeTime(right.dateOnlyReminderTime)
  );
}

function describeTicks(ticks: string): string {
  const minutes = Number(BigInt(ticks)) / Number(TICKS_PER_MINUTE);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} before`;
}

/**
 * The offsets a default can use: the editor's list, plus a stored offset
 * outside it, shown as its own option so saving keeps it.
 */
export function defaultOffsetOptions(selected: string) {
  const listed = REMINDER_OFFSETS.map(({ minutes, label }) => ({
    value: String(BigInt(minutes) * TICKS_PER_MINUTE),
    label,
  }));
  return listed.some((option) => option.value === selected)
    ? listed
    : [...listed, { value: selected, label: describeTicks(selected) }];
}
