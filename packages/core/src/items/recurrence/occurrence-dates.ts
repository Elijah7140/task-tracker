import { MetadataRuleError } from "../../metadata/metadata-rule-error.js";
import type { TodoItem } from "../todo-item.js";
import { isSupportedDate } from "./recurrence-calculator.js";
import type { RecurrenceRule } from "./recurrence-rule.js";

type ItemDates = Pick<TodoItem, "dueDate" | "scheduledStart" | "scheduledEnd">;

/** Shown when moving to the next occurrence would leave the supported calendar. */
export const NEXT_REPEAT_OVERFLOW =
  "The next repeat would move a date outside the supported calendar.";

/** The floating date a rule advances: the due date, else the scheduled start's date (§7.11). */
export function recurrenceDate(item: ItemDates): Temporal.PlainDate | null {
  return item.dueDate ?? item.scheduledStart?.toPlainDate() ?? null;
}

/**
 * Moves the due date and scheduled block by the same number of days, keeping
 * their times and the block's length. Fails with `overflowMessage` when a date
 * would leave the supported calendar.
 */
export function shiftItemDates<Item extends ItemDates>(
  item: Item,
  days: number,
  overflowMessage = NEXT_REPEAT_OVERFLOW,
): Item {
  const shifted = {
    ...item,
    dueDate: item.dueDate?.add({ days }) ?? null,
    scheduledStart: item.scheduledStart?.add({ days }) ?? null,
    scheduledEnd: item.scheduledEnd?.add({ days }) ?? null,
  };
  const dates = [shifted.dueDate, shifted.scheduledStart, shifted.scheduledEnd];
  if (dates.some((date) => date !== null && !isSupportedDate(Temporal.PlainDate.from(date)))) {
    throw new MetadataRuleError(overflowMessage);
  }
  return shifted;
}

/** Days from the item's recurrence date to `next`. */
export function daysUntil(item: ItemDates, next: Temporal.PlainDate): number {
  return recurrenceDate(item)!.until(next, { largestUnit: "days" }).days;
}

/** The rule after one occurrence is used: a count limit decreases by one. */
export function advanceRule(rule: RecurrenceRule): RecurrenceRule {
  return rule.remaining === null ? rule : { ...rule, remaining: rule.remaining - 1 };
}
