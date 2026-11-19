import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { DateText, FloatingTimestamp, Guid, TimeText, UtcTimestamp } from "../storage-codecs.js";
import { projectBatch, trackedColumns, trackedFields } from "./row-fields.js";

const row = Schema.Struct({
  ...trackedFields,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  parentItemId: Schema.NullOr(Guid),
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  ticketNumber: Schema.NullOr(Schema.String),
  itemTypeId: Schema.NullOr(Guid),
  priorityLevelId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(DateText),
  dueTime: Schema.NullOr(TimeText),
  scheduledStart: Schema.NullOr(FloatingTimestamp),
  scheduledEnd: Schema.NullOr(FloatingTimestamp),
  completedAtUtc: Schema.NullOr(UtcTimestamp),
}).pipe(
  Schema.encodeKeys({
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
  }),
);

/** Item reads, cascades and completion updates needed by project and folder operations. */
export function projectItemRepository(sql: SqlClient.SqlClient) {
  const deleteBatch = (folderBatchOnly: boolean) =>
    SqlSchema.void({
      Request: projectBatch,
      execute: ({ batchId, now, projectId }) => sql`UPDATE TodoItem SET DeletedAtUtc = ${now},
      UpdatedAtUtc = ${now}, DeletionBatchId = ${batchId}
      WHERE ProjectId = ${projectId} AND ${activeRow(sql)}
      ${
        folderBatchOnly
          ? sql`AND FolderId IN (
        SELECT Id FROM Folder WHERE ProjectId = ${projectId} AND DeletionBatchId = ${batchId}
      )`
          : sql` `
      }`,
    });
  return {
    listActive: SqlSchema.findAll({
      Request: Guid,
      Result: row,
      execute: (projectId) =>
        sql`SELECT * FROM TodoItem WHERE ProjectId = ${projectId} AND ${activeRow(sql)}`,
    }),
    deleteForProject: deleteBatch(false),
    deleteForFolderBatch: deleteBatch(true),
    restoreBatch: SqlSchema.void({
      Request: projectBatch,
      execute: ({ batchId, now, projectId }) => sql`UPDATE TodoItem SET DeletedAtUtc = NULL,
        UpdatedAtUtc = ${now}, DeletionBatchId = NULL
        WHERE ProjectId = ${projectId} AND DeletionBatchId = ${batchId} AND DeletedAtUtc IS NOT NULL`,
    }),
    setCompletion: SqlSchema.void({
      Request: Schema.Struct({
        itemId: Guid,
        projectId: Guid,
        completedAtUtc: Schema.NullOr(UtcTimestamp),
        now: UtcTimestamp,
      }),
      execute: ({ itemId, projectId, completedAtUtc, now }) => sql`UPDATE TodoItem
        SET CompletedAtUtc = ${completedAtUtc}, UpdatedAtUtc = ${now}
        WHERE Id = ${itemId} AND ProjectId = ${projectId} AND ${activeRow(sql)}`,
    }),
  };
}
