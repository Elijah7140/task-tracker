import { MetadataRuleError } from "../../metadata/metadata-rule-error.js";
import type { TodoItem } from "../todo-item.js";
import { advanceRule, daysUntil, recurrenceDate, shiftItemDates } from "./occurrence-dates.js";
import { nextOccurrence } from "./recurrence-calculator.js";
import { findRecurrenceError, type RecurrenceRule } from "./recurrence-rule.js";

/** Shown when a rule has no due date to advance. */
export const RECURRENCE_DATE_REQUIRED = "A repeating item needs a due date.";

/**
 * Validates `rule` against the item's final dates and returns the rule and
 * series to store. An edited rule keeps its series; a new rule starts one.
 */
export function itemRecurrence(
  item: TodoItem,
  dates: Pick<TodoItem, "dueDate">,
  rule: RecurrenceRule | null,
  newSeriesId: () => string,
): Pick<TodoItem, "recurrence" | "recurrenceSeriesId"> {
  if (rule === null) {
    return { recurrence: null, recurrenceSeriesId: null };
  }
  if (recurrenceDate(dates) === null) {
    throw new MetadataRuleError(RECURRENCE_DATE_REQUIRED);
  }
  const error = findRecurrenceError(rule);
  if (error !== null) {
    throw new MetadataRuleError(error.message);
  }
  return { recurrence: rule, recurrenceSeriesId: item.recurrenceSeriesId ?? newSeriesId() };
}

/**
 * "Skip this one" (§7.11): moves an open occurrence's own dates to the next
 * occurrence and consumes one count. Null means the rule has no next date,
 * so the final occurrence stays in place.
 */
export function skipOccurrence(
  item: TodoItem,
  today: Temporal.PlainDate,
  now: Temporal.Instant,
): TodoItem | null {
  const rule = item.recurrence;
  const date = recurrenceDate(item);
  if (rule === null || item.completedAtUtc !== null || date === null) {
    throw new MetadataRuleError("Only an open repeating item can be skipped.");
  }
  const next = nextOccurrence(rule, date, today);
  if (next === null) {
    return null;
  }
  const shifted = shiftItemDates(item, daysUntil(item, next));
  return { ...shifted, recurrence: advanceRule(rule), updatedAtUtc: now };
}

/** "Stop repeating" removes the rule and series from this occurrence only. */
export function stopRepeating(item: TodoItem, now: Temporal.Instant): TodoItem {
  return { ...item, recurrence: null, recurrenceSeriesId: null, updatedAtUtc: now };
}
