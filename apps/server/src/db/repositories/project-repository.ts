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
  iconKey: Schema.NullOr(Schema.String),
}).pipe(
  Schema.encodeKeys({
    ...trackedColumns,
    name: "Name",
    description: "Description",
    iconKey: "IconKey",
  }),
);

const iconEdit = Schema.Struct({
  id: trackedFields.id,
  iconKey: Schema.NullOr(Schema.String),
  updatedAtUtc: trackedFields.updatedAtUtc,
}).pipe(Schema.encodeKeys({ ...trackedColumns, iconKey: "IconKey" }));

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
    listWithDeletions: SqlSchema.findAll({
      Request: Schema.NullOr(Guid),
      Result: row,
      execute: (projectId) => sql`SELECT project.* FROM Project AS project
        WHERE (${projectId} IS NULL OR project.Id = ${projectId}) AND (
          project.DeletedAtUtc IS NOT NULL OR
          EXISTS (SELECT 1 FROM Folder WHERE ProjectId = project.Id AND DeletedAtUtc IS NOT NULL) OR
          EXISTS (SELECT 1 FROM TodoItem WHERE ProjectId = project.Id AND DeletedAtUtc IS NOT NULL)
        ) ORDER BY project.rowid`,
    }),
    findWithBatch: SqlSchema.findOneOption({
      Request: Guid,
      Result: row,
      execute: (batchId) => sql`SELECT project.* FROM Project AS project WHERE project.Id IN (
        SELECT Id FROM Project WHERE DeletionBatchId = ${batchId} AND DeletedAtUtc IS NOT NULL
        UNION SELECT ProjectId FROM Folder WHERE DeletionBatchId = ${batchId} AND DeletedAtUtc IS NOT NULL
        UNION SELECT ProjectId FROM TodoItem WHERE DeletionBatchId = ${batchId} AND DeletedAtUtc IS NOT NULL
      )`,
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
    /** Writes the project's icon choice (§7.19). */
    updateIcon: SqlSchema.void({
      Request: iconEdit,
      execute: ({ Id, ...values }) =>
        sql`UPDATE Project SET ${sql.update(values)} WHERE Id = ${Id} AND ${activeRow(sql)}`,
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
