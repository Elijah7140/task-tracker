import { MetadataRuleError } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";
import type { UndoRow } from "./undo-rows.js";

const read = (sql: SqlClient.SqlClient, table: string, id: UndoRow[string] | undefined) =>
  id == null
    ? Effect.succeed(undefined)
    : sql<UndoRow>`SELECT * FROM ${sql(table)} WHERE Id = ${id}`.pipe(Effect.map(([row]) => row));

const refuse = (message: string) => Effect.fail(new MetadataRuleError(message));

const verifyAncestors = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  kind: "folder" | "item",
  row: UndoRow,
  firstId: UndoRow[string] | undefined,
) {
  const [table, name, parent] =
    kind === "folder"
      ? ["Folder", "Name", "ParentFolderId"]
      : ["TodoItem", "Title", "ParentItemId"];
  const visited = new Set();
  for (let id = firstId; id != null;) {
    if (visited.has(id)) {
      return yield* refuse("Applying this step would create a cycle.");
    }
    visited.add(id);
    const ancestor = yield* read(sql, table, id);
    if (ancestor === undefined) {
      return yield* refuse(`The parent ${kind} is missing. Restore the parent first.`);
    }
    if (ancestor.DeletedAtUtc !== null) {
      return yield* refuse(`Restore the ${kind} '${ancestor[name]}' first`);
    }
    if (
      ancestor.ProjectId !== row.ProjectId ||
      (kind === "item" && ancestor.FolderId !== row.FolderId)
    ) {
      return yield* refuse("Applying this step would move a row outside its parent's area.");
    }
    id = ancestor[parent];
  }
});

const verifyActiveRow = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  table: "Folder" | "TodoItem",
  target: UndoRow,
) {
  if (table === "TodoItem") {
    yield* verifyAncestors(sql, "item", target, target.ParentItemId);
  }
  yield* verifyAncestors(
    sql,
    "folder",
    target,
    table === "Folder" ? target.ParentFolderId : target.FolderId,
  );
  const project = yield* read(sql, "Project", target.ProjectId);
  if (project?.DeletedAtUtc !== null) {
    return yield* refuse("Restore the project first");
  }
});

function activeContents(sql: SqlClient.SqlClient, table: string, id: UndoRow[string]) {
  if (table === "Project") {
    return sql`SELECT Id FROM Folder WHERE ProjectId = ${id} AND DeletedAtUtc IS NULL
      UNION ALL SELECT Id FROM TodoItem WHERE ProjectId = ${id} AND DeletedAtUtc IS NULL LIMIT 1`;
  }
  if (table === "Folder") {
    return sql`SELECT Id FROM Folder WHERE ParentFolderId = ${id} AND DeletedAtUtc IS NULL
      UNION ALL SELECT Id FROM TodoItem WHERE FolderId = ${id} AND DeletedAtUtc IS NULL LIMIT 1`;
  }
  return sql`SELECT Id FROM TodoItem WHERE ParentItemId = ${id} AND DeletedAtUtc IS NULL LIMIT 1`;
}

const relationshipChanged = (source: UndoRow | undefined, target: UndoRow) =>
  source?.DeletedAtUtc !== null ||
  ["ProjectId", "FolderId", "ParentItemId", "ParentFolderId"].some(
    (column) => source[column] !== target[column],
  );

/** Checks the proposed tree inside the transaction so a refusal rolls every change back. */
export const verifyReplayHierarchy = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
) {
  for (const { table, source, target } of rows) {
    if (target === undefined || !["Project", "Folder", "TodoItem"].includes(table)) {
      continue;
    }
    if (source?.DeletedAtUtc === null && target.DeletedAtUtc !== null) {
      const contents = yield* activeContents(sql, table, target.Id!);
      if (contents.length > 0) {
        return yield* refuse(
          "The deleted branch has new contents. Applying this step would leave them in a deleted location.",
        );
      }
    }
    if (
      (table === "Folder" || table === "TodoItem") &&
      target.DeletedAtUtc === null &&
      relationshipChanged(source, target)
    ) {
      yield* verifyActiveRow(sql, table, target);
    }
    if (table === "TodoItem" && source !== undefined && source.FolderId !== target.FolderId) {
      const misplaced = yield* sql`SELECT Id FROM TodoItem WHERE ParentItemId = ${target.Id}
        AND FolderId IS NOT ${target.FolderId} LIMIT 1`;
      if (misplaced.length > 0) {
        return yield* refuse("Applying this step would move a row outside its parent's area.");
      }
    }
  }
});
