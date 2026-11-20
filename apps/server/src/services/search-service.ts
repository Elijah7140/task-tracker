import {
  DEFAULT_SEARCH_LIMIT,
  MetadataRuleError,
  validateItemQuery,
  type ItemQuery,
  type SearchScope,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/sql";
import { searchRepository } from "../db/repositories/search-repository.js";
import { checkRules } from "./check-rules.js";
import { searchRegistry } from "./search-registry.js";
import { searchResultProjection } from "./search-result-projection.js";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const registry = searchRegistry(sql);
  const rows = searchRepository(sql);
  const project = searchResultProjection(sql);

  /** Lists built-in and active custom fields available in `scope`. */
  const listFields = Effect.fnUntraced(function* (scope: SearchScope) {
    yield* registry.validateScope(scope);
    return yield* registry.listFields(scope);
  }, sql.withTransaction);

  /** Lists the active choices of the field `fieldKey` names in `scope`. */
  const listChoices = Effect.fnUntraced(function* (scope: SearchScope, fieldKey: string) {
    yield* registry.validateScope(scope);
    return yield* registry.listChoices(yield* registry.findField(scope, fieldKey));
  }, sql.withTransaction);

  /**
   * Validates the scope and every filter, then reads one bounded page of results
   * in the same transaction, so validation and the search see one snapshot.
   */
  const search = Effect.fnUntraced(function* (
    query: ItemQuery,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      return yield* Effect.fail(new MetadataRuleError("Search limit must be positive."));
    }
    yield* registry.validateScope(query.scope);
    const context = yield* registry.validationContext(query);
    yield* checkRules(() => validateItemQuery(query, context));
    const page = yield* rows.search(query, context.fields, limit);
    return { items: yield* project(page.items), hasMore: page.hasMore };
  }, sql.withTransaction);

  /** The current project and folder of an active item, or null once it is deleted. */
  const locateItem = Effect.fnUntraced(function* (itemId: string) {
    return Option.getOrNull(yield* rows.locate(itemId));
  }, sql.withTransaction);

  return { listFields, listChoices, search, locateItem };
});

/** Transactional scoped search, field registry and result activation (§7.2). */
export class SearchService extends Context.Service<SearchService, Effect.Success<typeof make>>()(
  "TaskTracker/SearchService",
) {
  static readonly layer = Layer.effect(this, make);
}
