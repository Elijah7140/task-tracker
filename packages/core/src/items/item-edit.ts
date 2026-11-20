import { isBlankText, trimText } from "../text/dotnet-white-space.js";
import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { validateReminderChoice, type ReminderChoice } from "../reminders/reminder-choice.js";
import { itemRecurrence } from "./recurrence/item-recurrence.js";
import type { RecurrenceRule } from "./recurrence/recurrence-rule.js";
import { itemTitle, type TodoItem } from "./todo-item.js";

/** The built-in fields an item edit replaces as a unit. */
export type ItemEdit = Pick<
  TodoItem,
  | "title"
  | "description"
  | "ticketNumber"
  | "itemTypeId"
  | "priorityLevelId"
  | "dueDate"
  | "dueTime"
  | "scheduledStart"
  | "scheduledEnd"
> & {
  readonly statusId?: string | null;
  /** The replacement repeat rule; omitted keeps the stored rule, null stops repeating. */
  readonly recurrence?: RecurrenceRule | null;
  /** The replacement reminder choice; omitted keeps the stored choice (§7.12). */
  readonly reminder?: ReminderChoice;
};

const noSeriesId = (): string => {
  throw new Error("A new repeat rule needs a series ID.");
};

/**
 * Validate a replacement of built-in item fields, preserving structure and completion.
 * A stored or replacement rule must still have a due date or scheduled start (§7.11).
 */
export function editItem(
  item: TodoItem,
  edit: ItemEdit,
  now: Temporal.Instant,
  newSeriesId: () => string = noSeriesId,
): TodoItem {
  const title = itemTitle(edit.title);
  const { ticketNumber, dueDate, dueTime, scheduledStart, scheduledEnd } = edit;
  if (ticketNumber !== null && trimText(ticketNumber).length > 100) {
    throw new MetadataRuleError("Ticket number must be at most 100 characters.");
  }
  if (dueDate === null && dueTime !== null) {
    throw new MetadataRuleError("Due time requires a due date.");
  }
  if (
    scheduledEnd !== null &&
    (scheduledStart === null || Temporal.PlainDateTime.compare(scheduledStart, scheduledEnd) > 0)
  ) {
    throw new MetadataRuleError("Scheduled end requires a start no later than the end.");
  }
  const rule = edit.recurrence === undefined ? item.recurrence : edit.recurrence;
  const recurrence = itemRecurrence(item, edit, rule, newSeriesId);
  const reminder =
    edit.reminder === undefined ? item.reminder : validateReminderChoice(edit.reminder);

  return {
    ...item,
    title,
    description: edit.description,
    ticketNumber: isBlankText(ticketNumber) ? null : trimText(ticketNumber!),
    itemTypeId: edit.itemTypeId,
    priorityLevelId: edit.priorityLevelId,
    dueDate,
    dueTime,
    scheduledStart,
    scheduledEnd,
    ...recurrence,
    reminder,
    updatedAtUtc: now,
  };
}
