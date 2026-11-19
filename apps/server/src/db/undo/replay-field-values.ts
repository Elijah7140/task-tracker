import { MetadataRuleError, type UndoDirection } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";

/**
 * Finds replayed values that the current field no longer accepts: a field scoped to another
 * project, a value column that does not match the field's type, or a choice of another field.
 * Missing fields and choices are left to the deferred foreign keys and their own refusal.
 */
const findInvalidValue = (sql: SqlClient.SqlClient, fieldIds: readonly string[]) => sql`
  SELECT 1 FROM ItemFieldValue AS value
    JOIN FieldDefinition AS field ON field.Id = value.FieldDefinitionId
    JOIN TodoItem AS item ON item.Id = value.ItemId
   WHERE ${sql.in("value.FieldDefinitionId", fieldIds)}
     AND ((field.ProjectId IS NOT NULL AND field.ProjectId <> item.ProjectId)
       OR (value.TextValue IS NOT NULL) + (value.NumberValue IS NOT NULL)
          + (value.DateValue IS NOT NULL) + (value.BoolValue IS NOT NULL)
          + (value.ChoiceId IS NOT NULL) <> 1
       OR CASE field.DataType
            WHEN 'Text' THEN value.TextValue
            WHEN 'Number' THEN value.NumberValue
            WHEN 'Date' THEN value.DateValue
            WHEN 'Boolean' THEN value.BoolValue
            WHEN 'Choice' THEN value.ChoiceId
          END IS NULL
       OR EXISTS (SELECT 1 FROM FieldChoice AS choice
                   WHERE choice.Id = value.ChoiceId
                     AND choice.FieldDefinitionId <> value.FieldDefinitionId))
   LIMIT 1`;

/** Fields whose stored values the step writes, or whose definition it rewrites. */
function affectedFieldIds(rows: readonly ReplayRow[]) {
  const ids = new Set<string>();
  for (const { table, target } of rows) {
    if (table === "ItemFieldValue" && target !== undefined) {
      ids.add(String(target.FieldDefinitionId));
    }
    if (table === "FieldDefinition" && target !== undefined) {
      ids.add(String(target.Id));
    }
  }
  return [...ids];
}

/**
 * Checks written custom values against the current field type, project scope and choices,
 * inside the replay transaction so a refusal rolls every change back.
 */
export const verifyReplayFieldValues = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
  direction: UndoDirection,
) {
  const fieldIds = affectedFieldIds(rows);
  if (fieldIds.length === 0) {
    return;
  }
  const invalid = yield* findInvalidValue(sql, fieldIds);
  if (invalid.length > 0) {
    return yield* Effect.fail(
      new MetadataRuleError(
        `A custom field changed since. Applying this step would store a value it no longer accepts; can't ${direction}.`,
      ),
    );
  }
});
