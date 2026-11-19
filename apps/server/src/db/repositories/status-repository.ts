import { firstDoneStatus } from "@task-tracker/core";
import { Effect, Schema, SchemaTransformation } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, Guid } from "../storage-codecs.js";

const editableFields = {
  id: Guid,
  name: Schema.String,
  isArchived: Bit,
  sortOrder: Schema.Int,
};
const columns = {
  id: "Id",
  name: "Name",
  isArchived: "IsArchived",
  sortOrder: "SortOrder",
} as const;
const editable = Schema.Struct(editableFields).pipe(Schema.encodeKeys(columns));
const kind = Schema.Literals([0, 1]).pipe(
  Schema.decodeTo(
    Schema.Literals(["Open", "Done"]),
    SchemaTransformation.transform({
      decode: (value) => (value === 0 ? "Open" : "Done"),
      encode: (value) => (value === "Open" ? 0 : 1),
    }),
  ),
);
const status = Schema.Struct({ ...editableFields, kind }).pipe(
  Schema.encodeKeys({ ...columns, kind: "Kind" }),
);

/** Read all statuses, including archived entries, and write editable lookup fields. */
export function statusRepository(sql: SqlClient.SqlClient) {
  const list = SqlSchema.findAll({
    Request: Schema.Void,
    Result: status,
    execute: () => sql`SELECT * FROM StatusLevel ORDER BY SortOrder, Id`,
  });

  return {
    list: () => list(undefined),
    firstDone: () => list(undefined).pipe(Effect.map((rows) => firstDoneStatus(rows)?.id ?? null)),
    insert: SqlSchema.void({
      Request: status,
      execute: (values) => sql`INSERT INTO StatusLevel ${sql.insert({ ...values, IsBuiltIn: 0 })}`,
    }),
    update: SqlSchema.void({
      Request: editable,
      execute: ({ Id, ...values }) =>
        sql`UPDATE StatusLevel SET ${sql.update(values)} WHERE Id = ${Id}`,
    }),
  };
}
