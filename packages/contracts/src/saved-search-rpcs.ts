import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import { SavedSearchDefinition, SavedSearchProjection } from "./saved-search.js";

/**
 * Saved searches (§7.7). Saving, renaming, deleting and reordering each record an
 * undo step. A saved search deleted meanwhile fails with `NotFound` for `SavedSearch`.
 */
export const SavedSearchRpcs = RpcGroup.make(
  Rpc.make("ListSavedSearches", {
    success: Schema.Array(SavedSearchProjection),
    error: RpcOperationError,
  }),
  Rpc.make("FindSavedSearch", {
    payload: { savedSearchId: Guid },
    success: SavedSearchProjection,
    error: RpcOperationError,
  }),
  Rpc.make("SaveSavedSearch", {
    payload: {
      name: Schema.String,
      definition: SavedSearchDefinition,
      /** Replace a saved search with the same name, ignoring case, instead of refusing. */
      overwrite: Schema.Boolean,
    },
    success: SavedSearchProjection,
    error: RpcOperationError,
  }),
  Rpc.make("RenameSavedSearch", {
    payload: { savedSearchId: Guid, name: Schema.String },
    error: RpcOperationError,
  }),
  Rpc.make("DeleteSavedSearch", {
    payload: { savedSearchId: Guid },
    error: RpcOperationError,
  }),
  Rpc.make("ReorderSavedSearches", {
    payload: { savedSearchIds: Schema.Array(Guid) },
    error: RpcOperationError,
  }),
);
