import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import {
  ItemQuery,
  ItemSearchResults,
  SearchableField,
  SearchChoice,
  SearchItemLocation,
  SearchScope,
} from "./search.js";

/**
 * Scoped search field registry, bounded item search and result activation lookup
 * (§7.2). Choices are resolved from a field key in its scope, so the client never
 * names a field definition directly.
 */
export const SearchRpcs = RpcGroup.make(
  Rpc.make("ListSearchFields", {
    payload: { scope: SearchScope },
    success: Schema.Array(SearchableField),
    error: RpcOperationError,
  }),
  Rpc.make("ListSearchChoices", {
    payload: { scope: SearchScope, fieldKey: Schema.String },
    success: Schema.Array(SearchChoice),
    error: RpcOperationError,
  }),
  Rpc.make("SearchItems", {
    payload: { query: ItemQuery, limit: Schema.optional(Schema.Int) },
    success: ItemSearchResults,
    error: RpcOperationError,
  }),
  Rpc.make("LocateSearchItem", {
    payload: { itemId: Guid },
    success: Schema.NullOr(SearchItemLocation),
    error: RpcOperationError,
  }),
);
