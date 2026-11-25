import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, Guid } from "../storage-codecs.js";

const editableFields = { id: Guid, name: Schema.String, isArchived: Bit, sortOrder: Schema.Int };
const editableColumns = {
  id: "Id",
  name: "Name",
  isArchived: "IsArchived",
  sortOrder: "SortOrder",
} as const;
const lookupFields = { ...editableFields, colorKey: Schema.NullOr(Schema.String), isBuiltIn: Bit };
const lookupColumns = { ...editableColumns, colorKey: "ColorKey", isBuiltIn: "IsBuiltIn" } as const;
const numberField = { number: Schema.NullOr(Schema.Int) };
const priorityLevel = Schema.Struct({ ...lookupFields, ...numberField }).pipe(
  Schema.encodeKeys({ ...lookupColumns, number: "Number" }),
);
const editablePriority = Schema.Struct({ ...editableFields, ...numberField }).pipe(
  Schema.encodeKeys({ ...editableColumns, number: "Number" }),
);
const editable = Schema.Struct(editableFields).pipe(Schema.encodeKeys(editableColumns));

/** Lookup persistence includes archived rows so they remain addressable and reserve their names. */
export function lookupRepository(sql: SqlClient.SqlClient) {
  function forTable<Row extends typeof priorityLevel>(table: "PriorityLevel", row: Row) {
    const list = SqlSchema.findAll({
      Request: Schema.Void,
      Result: row,
      execute: () => sql`SELECT * FROM ${sql(table)} ORDER BY SortOrder, rowid`,
    });
    return {
      list: () => list(undefined),
      insert: SqlSchema.void({
        Request: row,
        execute: (values) => sql`INSERT INTO ${sql(table)} ${sql.insert(values)}`,
      }),
      update: SqlSchema.void({
        Request: editable,
        execute: ({ Id, ...values }) =>
          sql`UPDATE ${sql(table)} SET ${sql.update(values)} WHERE Id = ${Id}`,
      }),
    };
  }
  return {
    priorityLevels: {
      ...forTable("PriorityLevel", priorityLevel),
      update: SqlSchema.void({
        Request: editablePriority,
        execute: ({ Id, ...values }) =>
          sql`UPDATE PriorityLevel SET ${sql.update(values)} WHERE Id = ${Id}`,
      }),
    },
  };
}
