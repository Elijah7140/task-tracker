import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { shiftItemDates } from "./recurrence/occurrence-dates.js";
import type { TodoItem } from "./todo-item.js";

/** Shown when a completed item is pushed back (§7.14). */
export const PUSH_BACK_COMPLETED = "Completed items cannot be pushed back.";

/** Shown when an item has neither a due date nor a scheduled block (§7.14). */
export const PUSH_BACK_UNDATED = "This item has no due date or scheduled block.";

/** Shown when adding a day would leave the supported calendar (§7.14). */
export const PUSH_BACK_OVERFLOW = "Pushing back would move a date outside the supported calendar.";

/** What decides whether an item can be pushed back. */
export interface PushBackEligibility {
  readonly isCompleted: boolean;
  readonly hasDates: boolean;
}

/** Why Push back one day is unavailable for an item, or null when it can move (§7.14). */
export function pushBackUnavailableReason({ isCompleted, hasDates }: PushBackEligibility) {
  if (isCompleted) {
    return PUSH_BACK_COMPLETED;
  }
  return hasDates ? null : PUSH_BACK_UNDATED;
}

/**
 * "Push back one day" (§7.14): moves the item's own due date and scheduled
 * block one floating calendar day later, keeping the due time and the block's
 * length. Sub-items, the repeat rule and the series are left alone.
 */
export function pushBackOneDay(item: TodoItem, now: Temporal.Instant): TodoItem {
  const reason = pushBackUnavailableReason({
    isCompleted: item.completedAtUtc !== null,
    hasDates: item.dueDate !== null || item.scheduledStart !== null,
  });
  if (reason !== null) {
    throw new MetadataRuleError(reason);
  }
  return { ...shiftItemDates(item, 1, PUSH_BACK_OVERFLOW), updatedAtUtc: now };
}
