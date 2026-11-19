import { EntityMissing, type SavedSearch, type SearchScope } from "@task-tracker/core";
import { Effect, Option, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Bit, Guid, UtcTimestamp } from "../storage-codecs.js";

const row = Schema.Struct({
  id: Guid,
  name: Schema.String,
  queryText: Schema.String,
  scopeKind: Schema.Literals(["AllProjects", "Project", "Folder"]),
  projectId: Schema.NullOr(Guid),
  folderId: Schema.NullOr(Guid),
  includeSubfolders: Bit,
  includeCompleted: Bit,
  sortOrder: Schema.Int,
  createdAtUtc: UtcTimestamp,
  updatedAtUtc: UtcTimestamp,
}).pipe(
  Schema.encodeKeys({
    id: "Id",
    name: "Name",
    queryText: "QueryText",
    scopeKind: "ScopeKind",
    projectId: "ProjectId",
    folderId: "FolderId",
    includeSubfolders: "IncludeSubfolders",
    includeCompleted: "IncludeCompleted",
    sortOrder: "SortOrder",
    createdAtUtc: "CreatedAtUtc",
    updatedAtUtc: "UpdatedAtUtc",
  }),
);

type Row = typeof row.Type;

/** The scope a stored row runs in. A scoped kind without a project searches everything. */
function scopeOf({ scopeKind, projectId, folderId, includeSubfolders }: Row): SearchScope {
  if (projectId === null || scopeKind === "AllProjects") {
    return { kind: "allProjects" };
  }
  return scopeKind === "Project"
    ? { kind: "project", projectId }
    : { kind: "area", projectId, folderId, includeSubfolders };
}

/** The legacy scope columns. Folder scopes include the project root, stored without a folder. */
function scopeColumns(scope: SearchScope) {
  switch (scope.kind) {
    case "allProjects":
      return { scopeKind: "AllProjects", projectId: null, folderId: null, includeSubfolders: true };
    case "project":
      return {
        scopeKind: "Project",
        projectId: scope.projectId,
        folderId: null,
        includeSubfolders: true,
      };
    case "area":
      return {
        scopeKind: "Folder",
        projectId: scope.projectId,
        folderId: scope.folderId,
        includeSubfolders: scope.includeSubfolders,
      };
  }
}

function toSavedSearch(stored: Row): SavedSearch {
  return {
    id: stored.id,
    name: stored.name,
    queryText: stored.queryText,
    scope: scopeOf(stored),
    includeCompleted: stored.includeCompleted,
    sortOrder: stored.sortOrder,
    createdAtUtc: stored.createdAtUtc,
    updatedAtUtc: stored.updatedAtUtc,
  };
}

function toRow(search: SavedSearch): Row {
  return {
    id: search.id,
    name: search.name,
    queryText: search.queryText,
    ...(scopeColumns(search.scope) as Pick<
      Row,
      "scopeKind" | "projectId" | "folderId" | "includeSubfolders"
    >),
    includeCompleted: search.includeCompleted,
    sortOrder: search.sortOrder,
    createdAtUtc: search.createdAtUtc,
    updatedAtUtc: search.updatedAtUtc,
  };
}

/** Saved-search queries and writes on the caller's transaction, in display order. */
export function savedSearchRepository(sql: SqlClient.SqlClient) {
  const list = SqlSchema.findAll({
    Request: Schema.Void,
    Result: row,
    execute: () => sql`SELECT * FROM SavedSearch ORDER BY SortOrder, Name, Id`,
  });
  const find = SqlSchema.findOneOption({
    Request: Guid,
    Result: row,
    execute: (id) => sql`SELECT * FROM SavedSearch WHERE Id = ${id}`,
  });
  const insert = SqlSchema.void({
    Request: row,
    execute: (values) => sql`INSERT INTO SavedSearch ${sql.insert(values)}`,
  });
  const update = SqlSchema.void({
    Request: row,
    execute: (values) =>
      sql`UPDATE SavedSearch SET ${sql.update(values, ["Id", "CreatedAtUtc"])}
          WHERE Id = ${values.Id}`,
  });

  return {
    list: () => list(undefined).pipe(Effect.map((rows) => rows.map(toSavedSearch))),
    require: (id: string) =>
      find(id).pipe(
        Effect.flatMap(
          Option.match({
            onSome: (stored) => Effect.succeed(toSavedSearch(stored)),
            onNone: () =>
              Effect.fail(new EntityMissing("SavedSearch", "This saved search no longer exists.")),
          }),
        ),
      ),
    insert: (search: SavedSearch) => insert(toRow(search)),
    /** Writes every field of a stored saved search except its creation time. */
    update: (search: SavedSearch) => update(toRow(search)),
    delete: SqlSchema.void({
      Request: Guid,
      execute: (id) => sql`DELETE FROM SavedSearch WHERE Id = ${id}`,
    }),
  };
}
