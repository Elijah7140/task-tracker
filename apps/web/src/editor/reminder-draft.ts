import type { Item, ReminderChoice } from "@task-tracker/contracts";

type Choice = typeof ReminderChoice.Type;

/** The offsets an item can choose, in minutes, with their labels (§7.12). */
export const REMINDER_OFFSETS: ReadonlyArray<{ readonly minutes: number; readonly label: string }> =
  [
    { minutes: 0, label: "At the due moment" },
    { minutes: 5, label: "5 minutes before" },
    { minutes: 15, label: "15 minutes before" },
    { minutes: 30, label: "30 minutes before" },
    { minutes: 60, label: "1 hour before" },
    { minutes: 120, label: "2 hours before" },
    { minutes: 1440, label: "1 day before" },
    { minutes: 2880, label: "2 days before" },
    { minutes: 10080, label: "1 week before" },
  ];

/** A Select value naming a choice: `default`, `none` or an offset in minutes. */
export type ReminderValue = string;

/** The stored choice. An item without one uses the default. */
export function storedReminder(item: typeof Item.Type): Choice {
  return item.reminder ?? { kind: "default" };
}

/** The Select value of a choice. */
export function reminderValue(choice: Choice): ReminderValue {
  return choice.kind === "offset" ? String(choice.minutes) : choice.kind;
}

/** The choice a Select value names. */
export function reminderFromValue(value: ReminderValue): Choice {
  if (value === "default" || value === "none") {
    return { kind: value };
  }
  return { kind: "offset", minutes: Number(value) };
}

/** Labels a stored offset outside the list, as legacy data may hold. */
export function describeOffset(minutes: number): string {
  const listed = REMINDER_OFFSETS.find((offset) => offset.minutes === minutes);
  if (listed !== undefined) {
    return listed.label;
  }
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} before`;
}

/** Whether the draft changes the stored choice. */
export function isReminderChanged(item: typeof Item.Type, draft: Choice | null): boolean {
  return draft !== null && reminderValue(draft) !== reminderValue(storedReminder(item));
}
