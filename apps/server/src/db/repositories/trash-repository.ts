import { Effect } from "effect";
import type { SqlClient } from "effect/sql";

const tables = { project: "Project", folder: "Folder", item: "TodoItem" } as const;

/** Trash-specific writes on the caller's transaction. SQLite cascades item-owned data and FTS. */
export function trashRepository(sql: SqlClient.SqlClient) {
  const deleteProject = Effect.fnUntraced(function* (projectId: string) {
    const fields = sql`SELECT Id FROM FieldDefinition WHERE ProjectId = ${projectId}`;
    yield* sql`DELETE FROM ItemFieldValue WHERE FieldDefinitionId IN (${fields})`;
    yield* sql`DELETE FROM FieldChoice WHERE FieldDefinitionId IN (${fields})`;
    yield* sql`DELETE FROM FieldDefinition WHERE ProjectId = ${projectId}`;
    yield* sql`DELETE FROM ProjectSetting WHERE ProjectId = ${projectId}`;
    yield* sql`DELETE FROM Project WHERE Id = ${projectId}`;
  });

  return {
    deleteProject,
    deleteItem: (id: string) => sql`DELETE FROM TodoItem WHERE Id = ${id}`,
    deleteFolder: (id: string) => sql`DELETE FROM Folder WHERE Id = ${id}`,
    placeRestoredTop: (kind: keyof typeof tables, id: string, sortOrder: number) =>
      sql`UPDATE ${sql(tables[kind])} SET SortOrder = ${sortOrder} WHERE Id = ${id}`,
  };
}
