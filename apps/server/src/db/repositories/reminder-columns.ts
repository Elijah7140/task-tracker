import type { ReminderChoice } from "@task-tracker/core";
import { Schema } from "effect";

/** The reminder choice columns of TodoItem (§7.12). */
export const reminderColumnFields = {
  reminderMode: Schema.NullOr(Schema.Int),
  reminderOffsetMinutes: Schema.NullOr(Schema.Int),
};

/** EF column names for {@link reminderColumnFields}. */
export const reminderColumnNames = {
  reminderMode: "ReminderMode",
  reminderOffsetMinutes: "ReminderOffsetMinutes",
} as const;

/** Decoded reminder choice columns. */
export type ReminderColumns = Schema.Struct<typeof reminderColumnFields>["Type"];

/** The legacy `ReminderMode` enum values. A null mode inherits the default. */
const NONE_MODE = 1;
const OFFSET_MODE = 2;

/**
 * Reads the stored choice the way the legacy scheduler did: mode None silences
 * the item, and otherwise any stored offset applies.
 */
export function readReminderChoice(columns: ReminderColumns): ReminderChoice {
  if (columns.reminderMode === NONE_MODE) {
    return { kind: "none" };
  }
  const minutes = columns.reminderOffsetMinutes;
  return minutes === null ? { kind: "default" } : { kind: "offset", minutes };
}

/** Splits a choice into its stored mode and offset. */
export function writeReminderChoice(choice: ReminderChoice): ReminderColumns {
  switch (choice.kind) {
    case "default":
      return { reminderMode: null, reminderOffsetMinutes: null };
    case "none":
      return { reminderMode: NONE_MODE, reminderOffsetMinutes: null };
    case "offset":
      return { reminderMode: OFFSET_MODE, reminderOffsetMinutes: choice.minutes };
  }
}
