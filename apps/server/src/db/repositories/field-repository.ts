import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, FieldDataType, Guid } from "../storage-codecs.js";

const definitionEdits = {
  id: Guid,
  displayName: Schema.String,
  dataType: FieldDataType,
  isArchived: Bit,
  sortOrder: Schema.Int,
};
const definitionColumns = {
  id: "Id",
  displayName: "DisplayName",
  dataType: "DataType",
  isArchived: "IsArchived",
  sortOrder: "SortOrder",
  key: "Key",
  projectId: "ProjectId",
} as const;
const definition = Schema.Struct({
  ...definitionEdits,
  key: Schema.String,
  projectId: Schema.NullOr(Guid),
}).pipe(Schema.encodeKeys(definitionColumns));
const definitionEdit = Schema.Struct(definitionEdits).pipe(Schema.encodeKeys(definitionColumns));

const choice = Schema.Struct({
  id: Guid,
  fieldDefinitionId: Guid,
  label: Schema.String,
  isArchived: Bit,
  sortOrder: Schema.Int,
}).pipe(
  Schema.encodeKeys({
    id: "Id",
    fieldDefinitionId: "FieldDefinitionId",
    label: "Label",
    isArchived: "IsArchived",
    sortOrder: "SortOrder",
  }),
);

/** Loads and writes scoped field metadata using the caller's transaction. */
export function fieldRepository(sql: SqlClient.SqlClient) {
  const listDefinitions = SqlSchema.findAll({
    Request: Schema.Void,
    Result: definition,
    execute: () => sql`SELECT * FROM FieldDefinition ORDER BY SortOrder, rowid`,
  });
  return {
    definitions: {
      list: () => listDefinitions(undefined),
      insert: SqlSchema.void({
        Request: definition,
        execute: (values) => sql`INSERT INTO FieldDefinition ${sql.insert(values)}`,
      }),
      update: SqlSchema.void({
        Request: definitionEdit,
        execute: ({ Id, ...values }) =>
          sql`UPDATE FieldDefinition SET ${sql.update(values)} WHERE Id = ${Id}`,
      }),
    },
    choices: {
      list: SqlSchema.findAll({
        Request: Guid,
        Result: choice,
        execute: (fieldId) => sql`SELECT * FROM FieldChoice
          WHERE FieldDefinitionId = ${fieldId} ORDER BY SortOrder, rowid`,
      }),
      findByIds: SqlSchema.findAll({
        Request: Schema.Array(Guid),
        Result: choice,
        execute: (ids) => sql`SELECT * FROM FieldChoice WHERE ${sql.in("Id", ids)}`,
      }),
      insert: SqlSchema.void({
        Request: choice,
        execute: (values) => sql`INSERT INTO FieldChoice ${sql.insert(values)}`,
      }),
      update: SqlSchema.void({
        Request: choice,
        execute: ({ Id, FieldDefinitionId, ...values }) =>
          sql`UPDATE FieldChoice SET ${sql.update(values)}
              WHERE Id = ${Id} AND FieldDefinitionId = ${FieldDefinitionId}`,
      }),
    },
  };
}
