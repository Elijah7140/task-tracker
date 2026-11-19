import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { Guid } from "../storage-codecs.js";
import { projectBatch, trackedColumns, trackedFields } from "./row-fields.js";

const folderFields = {
  projectId: Guid,
  parentFolderId: Schema.NullOr(Guid),
  name: Schema.String,
};
const folderColumns = {
  ...trackedColumns,
  projectId: "ProjectId",
  parentFolderId: "ParentFolderId",
  name: "Name",
} as const;
const row = Schema.Struct({ ...trackedFields, ...folderFields }).pipe(
  Schema.encodeKeys(folderColumns),
);
const { createdAtUtc: _, ...editableFields } = trackedFields;
const edit = Schema.Struct({ ...editableFields, ...folderFields }).pipe(
  Schema.encodeKeys(folderColumns),
);

/** Folder queries and writes on the caller's transaction. */
export function folderRepository(sql: SqlClient.SqlClient) {
  const list = (includeDeleted: boolean) =>
    SqlSchema.findAll({
      Request: Guid,
      Result: row,
      execute: (projectId) =>
        sql`SELECT * FROM Folder WHERE ProjectId = ${projectId}
            ${includeDeleted ? sql` ` : sql`AND ${activeRow(sql)}`} ORDER BY rowid`,
    });
  return {
    listActive: list(false),
    listAll: list(true),
    insert: SqlSchema.void({
      Request: row,
      execute: (values) => sql`INSERT INTO Folder ${sql.insert(values)}`,
    }),
    update: SqlSchema.void({
      Request: edit,
      execute: ({ Id, ProjectId, ...values }) => sql`UPDATE Folder SET ${sql.update(values)}
        WHERE Id = ${Id} AND ProjectId = ${ProjectId}`,
    }),
    deleteForProject: SqlSchema.void({
      Request: projectBatch,
      execute: ({ batchId, now, projectId }) => sql`UPDATE Folder SET DeletedAtUtc = ${now},
        UpdatedAtUtc = ${now}, DeletionBatchId = ${batchId}
        WHERE ProjectId = ${projectId} AND ${activeRow(sql)}`,
    }),
    restoreForProject: SqlSchema.void({
      Request: projectBatch,
      execute: ({ batchId, now, projectId }) => sql`UPDATE Folder SET DeletedAtUtc = NULL,
        UpdatedAtUtc = ${now}, DeletionBatchId = NULL
        WHERE ProjectId = ${projectId} AND DeletionBatchId = ${batchId} AND DeletedAtUtc IS NOT NULL`,
    }),
  };
}
