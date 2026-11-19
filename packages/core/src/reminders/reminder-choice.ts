import { MetadataRuleError } from "../metadata/metadata-rule-error.js";

/** The offsets, in minutes before the due moment, that an item can choose (§7.12). */
export const REMINDER_OFFSET_MINUTES = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080] as const;

/**
 * An item's reminder choice: the effective default, no reminder, or a listed
 * offset before the due moment.
 */
export type ReminderChoice =
  | { readonly kind: "default" }
  | { readonly kind: "none" }
  | { readonly kind: "offset"; readonly minutes: number };

/** The choice of a new item, which follows the effective settings. */
export const DEFAULT_REMINDER: ReminderChoice = { kind: "default" };

/** Returns the choice unchanged when its offset is one of the listed offsets. */
export function validateReminderChoice(choice: ReminderChoice): ReminderChoice {
  const listed = REMINDER_OFFSET_MINUTES as readonly number[];
  if (choice.kind === "offset" && !listed.includes(choice.minutes)) {
    throw new MetadataRuleError("Choose one of the listed reminder offsets.");
  }
  return choice;
}

/** Whether two choices remind in the same way. */
export function sameReminderChoice(left: ReminderChoice, right: ReminderChoice): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  return left.kind !== "offset" || left.minutes === (right as typeof left).minutes;
}
