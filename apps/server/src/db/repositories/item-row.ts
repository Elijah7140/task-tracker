import type { TodoItem } from "@task-tracker/core";
import { Effect, Schema, SchemaIssue, SchemaTransformation } from "effect";
import { Statement } from "effect/sql";
import { DateText, FloatingTimestamp, Guid, TimeText, UtcTimestamp } from "../storage-codecs.js";
import {
  readRecurrence,
  recurrenceColumnFields,
  recurrenceColumnNames,
  writeRecurrence,
} from "./recurrence-columns.js";
import {
  readReminderChoice,
  reminderColumnFields,
  reminderColumnNames,
  writeReminderChoice,
} from "./reminder-columns.js";
import { trackedColumns, trackedFields } from "./row-fields.js";

const structureFields = {
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  parentItemId: Schema.NullOr(Guid),
};
const editFields = {
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  ticketNumber: Schema.NullOr(Schema.String),
  itemTypeId: Schema.NullOr(Guid),
  priorityLevelId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(DateText),
  dueTime: Schema.NullOr(TimeText),
  scheduledStart: Schema.NullOr(FloatingTimestamp),
  scheduledEnd: Schema.NullOr(FloatingTimestamp),
};
const columns = {
  ...trackedColumns,
  projectId: "ProjectId",
  folderId: "FolderId",
  parentItemId: "ParentItemId",
  title: "Title",
  description: "Description",
  ticketNumber: "TicketNumber",
  itemTypeId: "ItemTypeId",
  priorityLevelId: "PriorityLevelId",
  dueDate: "DueDate",
  dueTime: "DueTime",
  scheduledStart: "ScheduledStart",
  scheduledEnd: "ScheduledEnd",
  statusId: "StatusId",
  reopenStatusId: "ReopenStatusId",
  completedAtUtc: "CompletedAtUtc",
} as const;

/** Selects the columns decoded by ItemRow. Reminder ticks require a separate bigint read. */
export const itemRowColumns = Statement.csv([
  ...Object.values(columns),
  ...Object.values(recurrenceColumnNames),
  ...Object.values(reminderColumnNames),
]);

const FlatItemRow = Schema.Struct({
  ...trackedFields,
  ...structureFields,
  ...editFields,
  statusId: Schema.NullOr(Guid),
  reopenStatusId: Schema.NullOr(Guid),
  completedAtUtc: Schema.NullOr(UtcTimestamp),
  ...recurrenceColumnFields,
  ...reminderColumnFields,
}).pipe(Schema.encodeKeys({ ...columns, ...recurrenceColumnNames, ...reminderColumnNames }));

type FlatItem = (typeof FlatItemRow)["Type"];

function nestRecurrence(row: FlatItem): TodoItem {
  const {
    recurrenceFrequency: _frequency,
    recurrenceInterval: _interval,
    recurrenceWeekdays: _weekdays,
    recurrenceMonthDay: _monthDay,
    recurrenceMonth: _month,
    recurrenceAnchor: _anchor,
    recurrenceEndKind: _endKind,
    recurrenceEndDate: _endDate,
    recurrenceRemaining: _remaining,
    reminderMode: _mode,
    reminderOffsetMinutes: _offset,
    ...item
  } = row;
  return { ...item, ...readRecurrence(row), reminder: readReminderChoice(row) };
}

function flattenRecurrence(item: TodoItem): FlatItem {
  const { recurrence: _rule, reminder, ...rest } = item;
  return { ...rest, ...writeRecurrence(item), ...writeReminderChoice(reminder) };
}

/**
 * TodoItem row with legacy column names, floating and UTC time codecs, and the
 * recurrence columns joined into one rule (§7.11) and the reminder choice (§7.12).
 */
export const ItemRow = FlatItemRow.pipe(
  Schema.decodeTo(
    Schema.declare(
      (value: unknown): value is TodoItem => typeof value === "object" && value !== null,
    ),
    SchemaTransformation.transformEffect({
      decode: (row: FlatItem) =>
        Effect.try({
          try: () => nestRecurrence(row),
          catch: (error) => new SchemaIssue.InvalidValue({ message: String(error) }, row),
        }),
      encode: (item: TodoItem) => Effect.succeed(flattenRecurrence(item)),
    }),
  ),
);

/** Columns written when a rule is set, skipped, stopped or used to create a successor. */
export const ItemRecurrenceRow = Schema.Struct({
  id: Guid,
  updatedAtUtc: UtcTimestamp,
  ...recurrenceColumnFields,
}).pipe(Schema.encodeKeys({ ...trackedColumns, ...recurrenceColumnNames }));

const { createdAtUtc: _, ...mutableFields } = trackedFields;

/** Columns modified by item tree operations, including deletion and restore. */
export const ItemStructureRow = Schema.Struct({ ...mutableFields, ...structureFields }).pipe(
  Schema.encodeKeys(columns),
);

/** Columns modified by an item metadata edit. */
export const ItemEditRow = Schema.Struct({
  id: Guid,
  updatedAtUtc: UtcTimestamp,
  ...editFields,
}).pipe(Schema.encodeKeys(columns));

/** Columns written by a direct priority assignment. */
export const ItemPriorityRow = Schema.Struct({
  id: Guid,
  updatedAtUtc: UtcTimestamp,
  priorityLevelId: editFields.priorityLevelId,
}).pipe(Schema.encodeKeys(columns));

/** Calendar rescheduling updates floating dates and the item's modification timestamp. */
export const ItemDatesRow = Schema.Struct({
  id: Guid,
  updatedAtUtc: UtcTimestamp,
  dueDate: editFields.dueDate,
  dueTime: editFields.dueTime,
  scheduledStart: editFields.scheduledStart,
  scheduledEnd: editFields.scheduledEnd,
}).pipe(Schema.encodeKeys(columns));

/** The reminder choice an editor save writes (§7.12). */
export const ItemReminderRow = Schema.Struct({
  id: Guid,
  ...reminderColumnFields,
}).pipe(Schema.encodeKeys({ id: "Id", ...reminderColumnNames }));
