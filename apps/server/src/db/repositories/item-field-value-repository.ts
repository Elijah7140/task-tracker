import { Effect, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, DateText, Guid, Real } from "../storage-codecs.js";

const valueKey = { itemId: Guid, fieldDefinitionId: Guid };
const value = Schema.Struct({
  ...valueKey,
  textValue: Schema.NullOr(Schema.String),
  numberValue: Schema.NullOr(Real),
  dateValue: Schema.NullOr(DateText),
  boolValue: Schema.NullOr(Bit),
  choiceId: Schema.NullOr(Guid),
}).pipe(
  Schema.encodeKeys({
    itemId: "ItemId",
    fieldDefinitionId: "FieldDefinitionId",
    textValue: "TextValue",
    numberValue: "NumberValue",
    dateValue: "DateValue",
    boolValue: "BoolValue",
    choiceId: "ChoiceId",
  }),
);

/** Persists typed custom values with the EF column names and the caller's transaction. */
export function itemFieldValueRepository(sql: SqlClient.SqlClient) {
  const findUsage = SqlSchema.findOne({
    Request: Guid,
    Result: Schema.Struct({ used: Bit }),
    // Soft-deleted items keep their values and still lock the definition's type.
    execute: (fieldId) => sql`SELECT EXISTS (
      SELECT 1 FROM ItemFieldValue WHERE FieldDefinitionId = ${fieldId}
    ) AS used`,
  });
  return {
    hasValues: (fieldId: string) => Effect.map(findUsage(fieldId), ({ used }) => used),
    list: SqlSchema.findAll({
      Request: Guid,
      Result: value,
      execute: (itemId) =>
        sql`SELECT * FROM ItemFieldValue WHERE ItemId = ${itemId} ORDER BY rowid`,
    }),
    upsert: SqlSchema.void({
      Request: value,
      execute: (values) => sql`INSERT INTO ItemFieldValue ${sql.insert(values)}
        ON CONFLICT (ItemId, FieldDefinitionId) DO UPDATE SET
          TextValue = excluded.TextValue, NumberValue = excluded.NumberValue,
          DateValue = excluded.DateValue, BoolValue = excluded.BoolValue, ChoiceId = excluded.ChoiceId`,
    }),
    remove: SqlSchema.void({
      Request: Schema.Struct(valueKey),
      execute: ({ itemId, fieldDefinitionId }) =>
        sql`DELETE FROM ItemFieldValue WHERE ItemId = ${itemId} AND FieldDefinitionId = ${fieldDefinitionId}`,
    }),
  };
}
