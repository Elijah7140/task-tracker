import { Schema } from "effect";
import { Statement } from "effect/sql";
import { DateText, FloatingTimestamp, Guid, TimeText, UtcTimestamp } from "../storage-codecs.js";
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
  completedAtUtc: "CompletedAtUtc",
} as const;

/** Selects the columns decoded by ItemRow. Reminder ticks require a separate bigint read. */
export const itemRowColumns = Statement.csv(Object.values(columns));

/** TodoItem row with legacy column names and floating and UTC time codecs. */
export const ItemRow = Schema.Struct({
  ...trackedFields,
  ...structureFields,
  ...editFields,
  completedAtUtc: Schema.NullOr(UtcTimestamp),
}).pipe(Schema.encodeKeys(columns));

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
