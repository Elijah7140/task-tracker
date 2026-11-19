import { EntityMissing } from "@task-tracker/core";
import { Effect, Option, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { Guid, UtcTimestamp } from "../storage-codecs.js";
import { ItemEditRow, ItemRow, itemRowColumns, ItemStructureRow } from "./item-row.js";

const area = Schema.Struct({ projectId: Guid, folderId: Schema.NullOr(Guid) });

/** Persist item edits and structure alongside completion changes in the caller's transaction. */
export function itemRepository(sql: SqlClient.SqlClient) {
  const findActive = SqlSchema.findOneOption({
    Request: Guid,
    Result: ItemRow,
    execute: (id) =>
      sql`SELECT ${itemRowColumns} FROM TodoItem WHERE Id = ${id} AND ${activeRow(sql)}`,
  });
  const listArea = (includeDeleted: boolean) =>
    SqlSchema.findAll({
      Request: area,
      Result: ItemRow,
      execute: ({ projectId, folderId }) => sql`SELECT ${itemRowColumns} FROM TodoItem
        WHERE ProjectId = ${projectId} AND FolderId IS ${folderId}
        ${includeDeleted ? sql` ` : sql`AND ${activeRow(sql)}`} ORDER BY rowid`,
    });

  return {
    loadActiveArea: listArea(false),
    // Deleted rows still carry their batch and follow the branch on cross-area moves.
    loadAreaIncludingDeleted: listArea(true),
    requireActive: (id: string) =>
      findActive(id).pipe(
        Effect.flatMap(
          Option.match({
            onSome: Effect.succeed,
            onNone: () => Effect.fail(new EntityMissing("Item")),
          }),
        ),
      ),
    insert: SqlSchema.void({
      Request: ItemRow,
      execute: (values) => sql`INSERT INTO TodoItem ${sql.insert(values)}`,
    }),
    updateStructure: SqlSchema.void({
      Request: ItemStructureRow,
      execute: ({ Id, ProjectId, ...values }) => sql`UPDATE TodoItem SET ${sql.update(values)}
        WHERE Id = ${Id} AND ProjectId = ${ProjectId}`,
    }),
    setStatus: SqlSchema.void({
      Request: Schema.Struct({ id: Guid, statusId: Schema.NullOr(Guid), now: UtcTimestamp }),
      execute: ({ id, statusId, now }) =>
        sql`UPDATE TodoItem SET StatusId = ${statusId}, UpdatedAtUtc = ${now}
          WHERE Id = ${id} AND ${activeRow(sql)}`,
    }),
    updateEdit: SqlSchema.void({
      Request: ItemEditRow,
      execute: ({ Id, ...values }) =>
        sql`UPDATE TodoItem SET ${sql.update(values)} WHERE Id = ${Id} AND ${activeRow(sql)}`,
    }),
  };
}
