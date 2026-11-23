import { MetadataRuleError } from "../../metadata/metadata-rule-error.js";
import type { TodoItem } from "../todo-item.js";
import { isSupportedDate } from "./recurrence-calculator.js";
import type { RecurrenceRule } from "./recurrence-rule.js";

type ItemDates = Pick<TodoItem, "dueDate">;

/** Shown when moving to the next occurrence would leave the supported calendar. */
export const NEXT_REPEAT_OVERFLOW =
  "The next repeat would move a date outside the supported calendar.";

/** The floating date a rule advances: the due date (§7.11). */
export function recurrenceDate(item: ItemDates): Temporal.PlainDate | null {
  return item.dueDate;
}

/**
 * Moves the due date by a number of days, keeping its time. Fails with
 * `overflowMessage` when the date would leave the supported calendar.
 */
export function shiftItemDates<Item extends ItemDates>(
  item: Item,
  days: number,
  overflowMessage = NEXT_REPEAT_OVERFLOW,
): Item {
  const dueDate = item.dueDate?.add({ days }) ?? null;
  if (dueDate !== null && !isSupportedDate(dueDate)) {
    throw new MetadataRuleError(overflowMessage);
  }
  return { ...item, dueDate };
}

/** Days from the item's recurrence date to `next`. */
export function daysUntil(item: ItemDates, next: Temporal.PlainDate): number {
  return recurrenceDate(item)!.until(next, { largestUnit: "days" }).days;
}

/** The rule after one occurrence is used: a count limit decreases by one. */
export function advanceRule(rule: RecurrenceRule): RecurrenceRule {
  return rule.remaining === null ? rule : { ...rule, remaining: rule.remaining - 1 };
}
