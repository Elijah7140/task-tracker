import type { SqlClient } from "effect/sql";
import type { UndoSource } from "../db/undo/undo-rows.js";

/**
 * The rows an area write can change, including the custom values and links that
 * a next occurrence copies (§7.11). Each predicate selects them before and after.
 */
export function areaUndoSources(
  sql: SqlClient.SqlClient,
  projectId: string,
  folderId: string | null,
): readonly UndoSource[] {
  const areaItems = sql`SELECT Id FROM TodoItem WHERE ProjectId = ${projectId} AND FolderId IS ${folderId}`;
  return [
    { table: "TodoItem", where: sql`ProjectId = ${projectId} AND FolderId IS ${folderId}` },
    { table: "ItemFieldValue", where: sql`ItemId IN (${areaItems})` },
    { table: "ItemLink", where: sql`ItemId IN (${areaItems})` },
  ];
}
