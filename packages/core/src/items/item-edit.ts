import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
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
> & { readonly statusId?: string | null };

/** Validate a replacement of built-in item fields, preserving structure and completion. */
export function editItem(item: TodoItem, edit: ItemEdit, now: Temporal.Instant): TodoItem {
  const title = itemTitle(edit.title);
  const { ticketNumber, dueDate, dueTime, scheduledStart, scheduledEnd } = edit;
  if (ticketNumber !== null && ticketNumber.length > 100) {
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

  return {
    ...item,
    title,
    description: edit.description,
    ticketNumber: ticketNumber?.trim() || null,
    itemTypeId: edit.itemTypeId,
    priorityLevelId: edit.priorityLevelId,
    dueDate,
    dueTime,
    scheduledStart,
    scheduledEnd,
    updatedAtUtc: now,
  };
}
