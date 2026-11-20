import {
  arrangeSavedSearches,
  createSavedSearch,
  duplicateSavedSearchMessage,
  ensureSavedSearchNameFree,
  findSavedSearchByName,
  MetadataRuleError,
  nextSavedSearchSortOrder,
  renameSavedSearch,
  savedSearchName,
  scopeProjectId,
  updateSavedSearch,
  type SavedSearch,
  type SavedSearchDefinition,
  type SearchScope,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { projectRepository } from "../db/repositories/project-repository.js";
import { savedSearchRepository } from "../db/repositories/saved-search-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const searches = savedSearchRepository(sql);
  const projects = projectRepository(sql);
  const savedSearchRow = (id: string) =>
    [{ table: "SavedSearch", where: sql`Id = ${id}` }] as const;

  /** A scoped search must name an active project when it is saved (§7.7). */
  const requireScopeProject = Effect.fnUntraced(function* (scope: SearchScope) {
    const projectId = scopeProjectId(scope);
    if (projectId !== null && Option.isNone(yield* projects.findActive(projectId))) {
      return yield* Effect.fail(
        new MetadataRuleError("The project this search is limited to no longer exists."),
      );
    }
  });

  const replace = Effect.fnUntraced(function* (
    existing: SavedSearch,
    definition: SavedSearchDefinition,
    overwrite: boolean,
  ) {
    if (!overwrite) {
      return yield* Effect.fail(new MetadataRuleError(duplicateSavedSearchMessage(existing.name)));
    }
    const now = yield* operationTime;
    const replaced = yield* checkRules(() => updateSavedSearch(existing, definition, now));
    yield* undo.capture(
      undoLabel("Replace saved search", existing.name),
      savedSearchRow(existing.id),
    );
    yield* searches.update(replaced);
    return replaced;
  });

  const add = Effect.fnUntraced(function* (
    name: string,
    definition: SavedSearchDefinition,
    all: ReadonlyArray<SavedSearch>,
  ) {
    const now = yield* operationTime;
    const order = nextSavedSearchSortOrder(all);
    const created = yield* checkRules(() =>
      createSavedSearch(newId(now), name, definition, now, order),
    );
    yield* undo.capture(undoLabel("Save search", created.name), savedSearchRow(created.id));
    yield* searches.insert(created);
    return created;
  });

  /**
   * Saves a new search, or replaces the one with the same name (ignoring case) when
   * `overwrite` is true. Without it, a name clash is a rule error.
   */
  const save = Effect.fnUntraced(function* (
    name: string,
    definition: SavedSearchDefinition,
    overwrite: boolean,
  ) {
    const cleanName = yield* checkRules(() => savedSearchName(name));
    yield* requireScopeProject(definition.scope);
    const all = yield* searches.list();
    const existing = findSavedSearchByName(all, cleanName, null);
    return existing === undefined
      ? yield* add(cleanName, definition, all)
      : yield* replace(existing, definition, overwrite);
  }, undo.record);

  /** Renames a saved search. The new name must not belong to another one. */
  const rename = Effect.fnUntraced(function* (id: string, name: string) {
    const search = yield* searches.require(id);
    const all = yield* searches.list();
    const now = yield* operationTime;
    const renamed = yield* checkRules(() => {
      const next = renameSavedSearch(search, name, now);
      ensureSavedSearchNameFree(all, next.name, search.id);
      return next;
    });
    yield* undo.capture(undoLabel("Rename saved search", renamed.name), savedSearchRow(search.id));
    yield* searches.update(renamed);
  }, undo.record);

  /** Deletes a saved search permanently. */
  const deleteSearch = Effect.fnUntraced(function* (id: string) {
    const search = yield* searches.require(id);
    yield* undo.capture(undoLabel("Delete saved search", search.name), savedSearchRow(search.id));
    yield* searches.delete(search.id);
  }, undo.record);

  /** Puts the listed searches first in the given order and the others after them. */
  const reorder = Effect.fnUntraced(function* (ids: ReadonlyArray<string>) {
    const orderedIds = yield* decodeIds(ids);
    const all = yield* searches.list();
    const arranged = yield* checkRules(() => arrangeSavedSearches(all, orderedIds));
    yield* undo.capture("Reorder saved searches", [{ table: "SavedSearch" }]);
    yield* Effect.forEach(arranged, searches.update, { discard: true });
  }, undo.record);

  return {
    /** Every saved search in display order. */
    list: () => sql.withTransaction(searches.list()),
    /** One saved search, or `EntityMissing` when it was deleted meanwhile. */
    find: (id: string) => sql.withTransaction(searches.require(id)),
    save,
    rename,
    delete: deleteSearch,
    reorder,
  };
});

/** Saved searches (§7.7): one transaction and one undo step per write. */
export class SavedSearchService extends Context.Service<SavedSearchService>()(
  "@task-tracker/server/SavedSearchService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
