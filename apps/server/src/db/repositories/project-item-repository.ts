import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { Guid, UtcTimestamp } from "../storage-codecs.js";
import { ItemRow } from "./item-row.js";
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
