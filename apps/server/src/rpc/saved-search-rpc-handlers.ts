import { SavedSearchRpcs } from "@task-tracker/contracts";
import type { SavedSearch } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SavedSearchService } from "../services/saved-search-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** The wire shape of a saved search: its name and definition, without stored bookkeeping. */
function savedSearchProjection({ id, name, queryText, scope, includeCompleted }: SavedSearch) {
  return { id, name, queryText, scope, includeCompleted };
}

/** Binds the saved-search RPCs to the transactional saved-search service (§7.7). */
export const savedSearchRpcHandlers = SavedSearchRpcs.toLayer(
  Effect.gen(function* () {
    const searches = yield* SavedSearchService;
    return {
      ListSavedSearches: () =>
        searches.list().pipe(
          Effect.map((all) => all.map(savedSearchProjection)),
          mapOperationError,
        ),
      FindSavedSearch: ({ savedSearchId }) =>
        searches.find(savedSearchId).pipe(Effect.map(savedSearchProjection), mapOperationError),
      SaveSavedSearch: ({ name, definition, overwrite }) =>
        searches
          .save(name, definition, overwrite)
          .pipe(Effect.map(savedSearchProjection), mapOperationError),
      RenameSavedSearch: ({ savedSearchId, name }) =>
        searches.rename(savedSearchId, name).pipe(mapOperationError),
      DeleteSavedSearch: ({ savedSearchId }) =>
        searches.delete(savedSearchId).pipe(mapOperationError),
      ReorderSavedSearches: ({ savedSearchIds }) =>
        searches.reorder(savedSearchIds).pipe(mapOperationError),
    };
  }),
).pipe(Layer.provide(SavedSearchService.layer));
