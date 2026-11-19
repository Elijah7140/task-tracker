import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { Guid, UtcTimestamp } from "../storage-codecs.js";
import { ItemRow, itemRowColumns } from "./item-row.js";
import { projectBatch } from "./row-fields.js";

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
      Result: ItemRow,
      execute: (projectId) =>
        sql`SELECT ${itemRowColumns} FROM TodoItem WHERE ProjectId = ${projectId} AND ${activeRow(sql)}`,
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
        SET StatusId = CASE
          WHEN ${completedAtUtc} IS NOT NULL AND CompletedAtUtc IS NULL THEN (
            SELECT Id FROM StatusLevel WHERE Kind = 1 AND IsArchived = 0 ORDER BY SortOrder, Id LIMIT 1
          )
          WHEN ${completedAtUtc} IS NULL AND CompletedAtUtc IS NOT NULL THEN ReopenStatusId
          ELSE StatusId END,
        ReopenStatusId = CASE
          WHEN ${completedAtUtc} IS NULL THEN NULL
          WHEN CompletedAtUtc IS NULL THEN StatusId
          ELSE ReopenStatusId END,
        CompletedAtUtc = ${completedAtUtc}, UpdatedAtUtc = ${now}
        WHERE Id = ${itemId} AND ProjectId = ${projectId} AND ${activeRow(sql)}`,
    }),
  };
}
