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
const itemType = Schema.Struct({ ...lookupFields, iconKey: Schema.NullOr(Schema.String) }).pipe(
  Schema.encodeKeys({ ...lookupColumns, iconKey: "IconKey" }),
);
const priorityLevel = Schema.Struct(lookupFields).pipe(Schema.encodeKeys(lookupColumns));
const editable = Schema.Struct(editableFields).pipe(Schema.encodeKeys(editableColumns));

/** Lookup persistence includes archived rows so they remain addressable and reserve their names. */
export function lookupRepository(sql: SqlClient.SqlClient) {
  function forTable<Row extends typeof itemType | typeof priorityLevel>(
    table: "ItemType" | "PriorityLevel",
    row: Row,
  ) {
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
    itemTypes: forTable("ItemType", itemType),
    priorityLevels: forTable("PriorityLevel", priorityLevel),
  };
}
