import { completionStatus } from "@task-tracker/core";
import { Effect, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { Guid, UtcTimestamp } from "../storage-codecs.js";
import { itemRepository } from "./item-repository.js";
import { statusRepository } from "./status-repository.js";
import { ItemRow, itemRowColumns } from "./item-row.js";
import { projectBatch } from "./row-fields.js";

/** Item reads, cascades and completion updates needed by project and folder operations. */
export function projectItemRepository(sql: SqlClient.SqlClient) {
  const items = itemRepository(sql);
  const statuses = statusRepository(sql);
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
  const writeCompletion = SqlSchema.void({
    Request: Schema.Struct({
      itemId: Guid,
      projectId: Guid,
      completedAtUtc: Schema.NullOr(UtcTimestamp),
      statusId: Schema.NullOr(Guid),
      reopenStatusId: Schema.NullOr(Guid),
      now: UtcTimestamp,
    }),
    execute: ({ itemId, projectId, completedAtUtc, statusId, reopenStatusId, now }) =>
      sql`UPDATE TodoItem SET StatusId = ${statusId}, ReopenStatusId = ${reopenStatusId},
        CompletedAtUtc = ${completedAtUtc}, UpdatedAtUtc = ${now}
        WHERE Id = ${itemId} AND ProjectId = ${projectId} AND ${activeRow(sql)}`,
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
    setCompletion: Effect.fnUntraced(function* (change: {
      itemId: string;
      projectId: string;
      completedAtUtc: Temporal.Instant | null;
      now: Temporal.Instant;
    }) {
      const item = yield* items.requireActive(change.itemId);
      const firstDone =
        change.completedAtUtc !== null && item.completedAtUtc === null
          ? yield* statuses.firstDone()
          : null;
      const references = completionStatus(item, change.completedAtUtc, firstDone);
      yield* writeCompletion({ ...change, ...references });
    }),
  };
}
