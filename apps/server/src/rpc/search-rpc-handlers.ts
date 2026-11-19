import { SearchRpcs } from "@task-tracker/contracts";
import { searchOperatorsFor, type SearchableField } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SearchService } from "../services/search-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** The wire shape of a searchable field: its operators instead of its server-side source. */
function toWireField(field: SearchableField) {
  const { key, displayName, dataType, fieldDefinitionId } = field;
  return { key, displayName, dataType, fieldDefinitionId, operators: searchOperatorsFor(field) };
}

/** Binds the scoped search RPCs to the transactional search service (§7.2). */
export const searchRpcHandlers = SearchRpcs.toLayer(
  Effect.gen(function* () {
    const search = yield* SearchService;
    return {
      ListSearchFields: ({ scope }) =>
        search.listFields(scope).pipe(
          Effect.map((fields) => fields.map(toWireField)),
          mapOperationError,
        ),
      ListSearchChoices: ({ scope, fieldKey }) =>
        search.listChoices(scope, fieldKey).pipe(mapOperationError),
      SearchItems: ({ query, limit }) => search.search(query, limit).pipe(mapOperationError),
      LocateSearchItem: ({ itemId }) => search.locateItem(itemId).pipe(mapOperationError),
    };
  }),
).pipe(Layer.provide(SearchService.layer));
