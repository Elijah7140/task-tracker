import { SearchQueryRpcs } from "@task-tracker/contracts";
import {
  describeQueryParseError,
  type QueryParseResult,
  type SearchChoice,
} from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SearchQueryService } from "../services/search-query-service.js";
import { mapOperationError } from "./map-operation-error.js";

/**
 * The wire shape of a parse: every error with its user-facing description, or the
 * parsed query with the choices its filters name for the filter builder.
 */
function toWireParse(
  text: string,
  result: QueryParseResult,
  choices: ReadonlyMap<string, ReadonlyArray<SearchChoice>>,
) {
  if (result.errors.length > 0) {
    const errors = result.errors.map((error) => ({
      ...error,
      description: describeQueryParseError(error, text),
    }));
    return { kind: "invalid" as const, errors };
  }
  const filtered = new Set(result.filters.map((filter) => filter.fieldKey));
  const named = [...choices].filter(([fieldKey]) => filtered.has(fieldKey));
  return {
    kind: "parsed" as const,
    ...result,
    choices: named.map(([fieldKey, options]) => ({ fieldKey, choices: options })),
  };
}

/** Binds the Search query box RPCs to the query service in the server's zone (§7.7). */
export const searchQueryRpcHandlers = (timeZone: string) =>
  SearchQueryRpcs.toLayer(
    Effect.gen(function* () {
      const queries = yield* SearchQueryService;
      return {
        ParseSearchQuery: ({ scope, text }) =>
          queries.parse(scope, text).pipe(
            Effect.map(({ result, choices }) => toWireParse(text, result, choices)),
            mapOperationError,
          ),
        FormatSearchQuery: ({ scope, text, filters }) =>
          queries.format(scope, text, filters).pipe(mapOperationError),
      };
    }),
  ).pipe(Layer.provide(SearchQueryService.layer(timeZone)));
