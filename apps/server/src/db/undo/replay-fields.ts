import { MetadataRuleError, nameKey } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";
import type { UndoRow } from "./undo-rows.js";

const isActive = (row: UndoRow) => row.IsArchived !== 1n;

/** Replayed rows of one table that make a row active under a new name or label. */
function newlyVisible(rows: readonly ReplayRow[], table: string, nameColumn: string) {
  return rows
    .filter((row) => row.table === table && row.target !== undefined && isActive(row.target))
    .filter(
      ({ source, target }) =>
        source === undefined ||
        source[nameColumn] !== target![nameColumn] ||
        source.IsArchived !== target!.IsArchived,
    )
    .map(({ target }) => target!);
}

/** The rows replay would leave behind, keyed by `Id`. */
const proposedRows = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  table: "FieldDefinition" | "FieldChoice",
  rows: readonly ReplayRow[],
) {
  const current = yield* sql<UndoRow>`SELECT * FROM ${sql(table)}`;
  const proposed = new Map(current.map((row) => [String(row.Id), row]));
  for (const { table: rowTable, source, target } of rows) {
    if (rowTable !== table) {
      continue;
    }
    if (target === undefined) {
      proposed.delete(String(source!.Id));
    } else {
      proposed.set(String(target.Id), target);
    }
  }
  return [...proposed.values()];
});

/** Legacy refuses to change the type of a field that gained values since the step. */
const verifyFieldTypes = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
) {
  const retyped = rows.filter(
    ({ table, source, target }) =>
      table === "FieldDefinition" &&
      source !== undefined &&
      target !== undefined &&
      source.DataType !== target.DataType,
  );
  for (const { target } of retyped) {
    const used = yield* sql`SELECT 1 FROM ItemFieldValue WHERE FieldDefinitionId = ${target!.Id}
      LIMIT 1`;
    if (used.length > 0) {
      return yield* Effect.fail(
        new MetadataRuleError(
          "This field is now in use. Applying this step would change its type.",
        ),
      );
    }
  }
});

const sharesScope = (left: UndoRow, right: UndoRow) =>
  left.ProjectId === null || right.ProjectId === null || left.ProjectId === right.ProjectId;

/** An active field's name must stay unique among the active fields visible with it. */
const verifyFieldNames = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
) {
  const candidates = newlyVisible(rows, "FieldDefinition", "DisplayName");
  if (candidates.length === 0) {
    return;
  }
  const fields = yield* proposedRows(sql, "FieldDefinition", rows);
  const conflict = candidates.some((candidate) =>
    fields.some(
      (field) =>
        field.Id !== candidate.Id &&
        isActive(field) &&
        sharesScope(field, candidate) &&
        nameKey(String(field.DisplayName)) === nameKey(String(candidate.DisplayName)),
    ),
  );
  if (conflict) {
    return yield* Effect.fail(
      new MetadataRuleError("A field with this name is now visible in the same project."),
    );
  }
});

/** An active choice's label must stay unique among its field's active choices. */
const verifyChoiceLabels = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
) {
  const candidates = newlyVisible(rows, "FieldChoice", "Label");
  if (candidates.length === 0) {
    return;
  }
  const choices = yield* proposedRows(sql, "FieldChoice", rows);
  const conflict = candidates.some((candidate) =>
    choices.some(
      (choice) =>
        choice.Id !== candidate.Id &&
        choice.FieldDefinitionId === candidate.FieldDefinitionId &&
        isActive(choice) &&
        nameKey(String(choice.Label)) === nameKey(String(candidate.Label)),
    ),
  );
  if (conflict) {
    return yield* Effect.fail(
      new MetadataRuleError("This choice label is now used by another choice."),
    );
  }
});

/**
 * Checks replayed field definitions and choices against current data before any write:
 * type changes of fields that gained values, and visible field names and active choice
 * labels that newer rows now use (legacy `UndoDependencyGuard`).
 */
export const verifyReplayFields = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
) {
  yield* verifyFieldTypes(sql, rows);
  yield* verifyFieldNames(sql, rows);
  yield* verifyChoiceLabels(sql, rows);
});
