import { Effect, Option, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { EntityMissing } from "@task-tracker/core";
import { activeRow } from "../active-row.js";
import { Guid } from "../storage-codecs.js";
import { projectBatch, trackedColumns, trackedFields } from "./row-fields.js";

const row = Schema.Struct({
  ...trackedFields,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
}).pipe(Schema.encodeKeys({ ...trackedColumns, name: "Name", description: "Description" }));

const edit = Schema.Struct({
  id: trackedFields.id,
  name: Schema.String,
  sortOrder: trackedFields.sortOrder,
  updatedAtUtc: trackedFields.updatedAtUtc,
}).pipe(Schema.encodeKeys({ ...trackedColumns, name: "Name" }));

/** Project queries and writes on the caller's transaction. */
export function projectRepository(sql: SqlClient.SqlClient) {
  const listActive = SqlSchema.findAll({
    Request: Schema.Void,
    Result: row,
    execute: () => sql`SELECT * FROM Project WHERE ${activeRow(sql)} ORDER BY SortOrder, rowid`,
  });
  const findActive = SqlSchema.findOneOption({
    Request: Guid,
    Result: row,
    execute: (id) => sql`SELECT * FROM Project WHERE Id = ${id} AND ${activeRow(sql)}`,
  });
  const findDeletedBatch = SqlSchema.findOneOption({
    Request: Guid,
    Result: row,
    execute: (batchId) =>
      sql`SELECT * FROM Project WHERE DeletionBatchId = ${batchId} AND DeletedAtUtc IS NOT NULL`,
  });

  return {
    listActive: () => listActive(undefined),
    listAll: SqlSchema.findAll({
      Request: Schema.Void,
      Result: row,
      execute: () => sql`SELECT * FROM Project ORDER BY SortOrder, rowid`,
    }),
    requireActive: (id: string) =>
      findActive(id).pipe(
        Effect.flatMap(
          Option.match({
            onSome: Effect.succeed,
            onNone: () => Effect.fail(new EntityMissing("Project")),
          }),
        ),
      ),
    findActive,
    findDeletedBatch,
    insert: SqlSchema.void({
      Request: row,
      execute: (values) => sql`INSERT INTO Project ${sql.insert(values)}`,
    }),
    update: SqlSchema.void({
      Request: edit,
      execute: ({ Id, ...values }) =>
        sql`UPDATE Project SET ${sql.update(values)} WHERE Id = ${Id}`,
    }),
    delete: SqlSchema.void({
      Request: projectBatch,
      execute: ({ batchId, now, projectId }) =>
        sql`UPDATE Project SET DeletedAtUtc = ${now}, UpdatedAtUtc = ${now},
              DeletionBatchId = ${batchId} WHERE Id = ${projectId} AND ${activeRow(sql)}`,
    }),
    restore: SqlSchema.void({
      Request: projectBatch,
      execute: ({ batchId, now, projectId }) =>
        sql`UPDATE Project SET DeletedAtUtc = NULL, UpdatedAtUtc = ${now},
              DeletionBatchId = NULL
              WHERE Id = ${projectId} AND DeletionBatchId = ${batchId} AND DeletedAtUtc IS NOT NULL`,
    }),
  };
}
