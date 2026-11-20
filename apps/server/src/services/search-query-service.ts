import {
  formatItemQuery,
  parseItemQuery,
  queryClauseKeys,
  type FieldFilter,
  type SearchableField,
  type SearchChoice,
  type SearchScope,
} from "@task-tracker/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { operationTime } from "./operation-time.js";
import { searchRegistry } from "./search-registry.js";

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const registry = searchRegistry(sql);

  /** The active choices of each choice field in `fields` that `keys` names. */
  const choicesNamed = Effect.fnUntraced(function* (
    fields: ReadonlyArray<SearchableField>,
    keys: ReadonlyArray<string>,
  ) {
    const named = fields.filter((field) => field.dataType === "Choice" && keys.includes(field.key));
    const entries = yield* Effect.forEach(named, (field) =>
      registry.listChoices(field).pipe(Effect.map((choices) => [field.key, choices] as const)),
    );
    return new Map<string, ReadonlyArray<SearchChoice>>(entries);
  });

  /**
   * Parses query text against the fields and choices in `scope`, resolving relative
   * dates from the operation's clock reading in the server's zone. Returns the
   * parse result with the choices its clauses name.
   */
  const parse = Effect.fnUntraced(function* (scope: SearchScope, text: string) {
    yield* registry.validateScope(scope);
    const fields = yield* registry.listFields(scope);
    const choices = yield* choicesNamed(fields, queryClauseKeys(text));
    const now = yield* operationTime;
    const context = { fields, choicesByFieldKey: choices, now, timeZone };
    return { result: parseItemQuery(text, context), choices };
  }, sql.withTransaction);

  /** Writes free text and filters as canonical query text with the current choice labels. */
  const format = Effect.fnUntraced(function* (
    scope: SearchScope,
    text: string | null,
    filters: ReadonlyArray<FieldFilter>,
  ) {
    yield* registry.validateScope(scope);
    const fields = yield* registry.listFields(scope);
    const choices = yield* choicesNamed(
      fields,
      filters.map((filter) => filter.fieldKey),
    );
    return formatItemQuery(text, filters, choices);
  }, sql.withTransaction);

  return { parse, format };
});

/** The Search query box: text syntax bound to the scoped search model (§7.7). */
export class SearchQueryService extends Context.Service<
  SearchQueryService,
  Effect.Success<ReturnType<typeof make>>
>()("TaskTracker/SearchQueryService") {
  static readonly layer = (timeZone: string) => Layer.effect(this, make(timeZone));
}
