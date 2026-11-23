import { trimText } from "../text/dotnet-white-space.js";
import type { DeletionFields } from "../hierarchy/deletion-fields.js";
import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { DEFAULT_REMINDER, type ReminderChoice } from "../reminders/reminder-choice.js";
import type { ItemKind } from "./item-kind.js";
import type { RecurrenceRule } from "./recurrence/recurrence-rule.js";

/** A task or sub-item in a single project area. */
export interface TodoItem extends DeletionFields {
  readonly id: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly parentItemId: string | null;
  /** ToDo or Ticket, chosen when the item is added (§7.19). */
  readonly kind: ItemKind;
  readonly title: string;
  readonly description: string | null;
  readonly ticketNumber: string | null;
  readonly priorityLevelId: string | null;
  readonly itemTypeId: string | null;
  readonly dueDate: Temporal.PlainDate | null;
  readonly dueTime: Temporal.PlainTime | null;
  readonly statusId: string | null;
  readonly reopenStatusId: string | null;
  readonly completedAtUtc: Temporal.Instant | null;
  /** The repeat rule, or null when the item does not repeat (§7.11). */
  readonly recurrence: RecurrenceRule | null;
  /** Shared by the occurrences of one series; null without a rule. */
  readonly recurrenceSeriesId: string | null;
  /** True once completing this occurrence created its successor, so it never creates another. */
  readonly recurrenceSuccessorCreated: boolean;
  /** When the item reminds before its due moment (§7.12). */
  readonly reminder: ReminderChoice;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}

/** Validate and trim the title shared by item creation and editing. */
export function itemTitle(title: string): string {
  const trimmed = trimText(title);
  if (trimmed.length === 0 || trimmed.length > 300) {
    throw new MetadataRuleError("Item title is required and must be at most 300 characters.");
  }
  return trimmed;
}

/** Create an open item before its tree assigns the sibling position. */
export function createItem(
  id: string,
  projectId: string,
  folderId: string | null,
  parentItemId: string | null,
  title: string,
  now: Temporal.Instant,
  kind: ItemKind = "Todo",
): TodoItem {
  return {
    id,
    projectId,
    folderId,
    parentItemId,
    kind,
    title: itemTitle(title),
    description: null,
    ticketNumber: null,
    priorityLevelId: null,
    itemTypeId: null,
    dueDate: null,
    dueTime: null,
    statusId: null,
    reopenStatusId: null,
    completedAtUtc: null,
    recurrence: null,
    recurrenceSeriesId: null,
    recurrenceSuccessorCreated: false,
    reminder: DEFAULT_REMINDER,
    sortOrder: 0,
    createdAtUtc: now,
    updatedAtUtc: now,
    deletedAtUtc: null,
    deletionBatchId: null,
  };
}
