import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { rewriteQueryField } from "./rewrite-query-field.js";

/** Updates only saved searches in scope when a custom field becomes reserved. */
export const reserveSearchKey = Effect.fnUntraced(function* (key: string, rewriteSaved: boolean) {
  const sql = yield* SqlClient.SqlClient;
  const collate = rewriteSaved ? sql`COLLATE NOCASE` : sql``;
  const [legacy] = yield* sql<{ Id: string; ProjectId: string | null }>`
    SELECT Id, ProjectId FROM FieldDefinition WHERE Key = ${key} ${collate}`;
  if (!legacy) {
    return;
  }

  const [replacement] = yield* sql<{ candidate: string }>`
    WITH RECURSIVE candidates(suffix, candidate) AS (
      SELECT 2, ${key} || '-2'
      UNION ALL
      SELECT suffix + 1, ${key} || '-' || (suffix + 1)
      FROM candidates
      WHERE EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidate ${collate})
    )
    SELECT candidate FROM candidates
    WHERE NOT EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidate ${collate})
    LIMIT 1`;
  if (!replacement) {
    return yield* Effect.die(new Error(`No available suffix for search field "${key}".`));
  }
  if (rewriteSaved) {
    yield* rewriteSavedSearches(key, replacement.candidate, legacy.ProjectId);
  }
  yield* sql`UPDATE FieldDefinition SET Key = ${replacement.candidate} WHERE Key = ${key} ${collate}`;
});

/** Renames a field in all saved searches or only the searches that can see a project field. */
export const rewriteSavedSearches = Effect.fnUntraced(function* (
  oldKey: string,
  newKey: string,
  projectId: string | null = null,
) {
  const sql = yield* SqlClient.SqlClient;
  const searches = yield* sql<{ Id: string; QueryText: string }>`
    SELECT Id, QueryText FROM SavedSearch
    WHERE ${projectId} IS NULL OR ScopeKind = 'AllProjects' OR ProjectId = ${projectId}`;
  for (const { Id, QueryText } of searches) {
    const rewritten = rewriteQueryField(QueryText, oldKey, newKey);
    if (rewritten !== QueryText) {
      yield* sql`UPDATE SavedSearch SET QueryText = ${rewritten} WHERE Id = ${Id}`;
    }
  }
});
