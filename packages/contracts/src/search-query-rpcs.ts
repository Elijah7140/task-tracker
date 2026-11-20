import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { RpcOperationError } from "./rpc-operation-error.js";
import { FieldFilter, SearchScope } from "./search.js";
import { ParsedSearchQuery } from "./search-query.js";

/**
 * The Search query box (§7.7). The server parses text against the fields and choices
 * in scope, resolving relative dates with its clock and zone, and writes filters back
 * as canonical text, so the box and the filter builder share one query model.
 */
export const SearchQueryRpcs = RpcGroup.make(
  Rpc.make("ParseSearchQuery", {
    payload: { scope: SearchScope, text: Schema.String },
    success: ParsedSearchQuery,
    error: RpcOperationError,
  }),
  Rpc.make("FormatSearchQuery", {
    payload: {
      scope: SearchScope,
      text: Schema.NullOr(Schema.String),
      filters: Schema.Array(FieldFilter),
    },
    success: Schema.String,
    error: RpcOperationError,
  }),
);
