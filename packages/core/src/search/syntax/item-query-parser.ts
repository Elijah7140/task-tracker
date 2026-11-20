import type { FieldFilter } from "../item-query.js";
import type { SearchableField } from "../searchable-field.js";
import { toFloating } from "../../time/floating-time.js";
import { toLowerInvariant } from "./query-characters.js";
import { queryClauseBinder, type BoundClause } from "./query-clause-binder.js";
import type { QueryParseError } from "./query-parse-error.js";
import type { QueryParseResult } from "./query-parse-result.js";
import { quoteIfNeeded } from "./query-quoting.js";
import { scanQuery } from "./query-scanner.js";
import { queryValueReader, type ChoicesByFieldKey } from "./query-value-reader.js";

/** The fields, choices, clock reading and zone a query is parsed against (§7.7). */
export interface QuerySyntaxContext {
  /** The fields visible in the search scope. */
  readonly fields: ReadonlyArray<SearchableField>;
  /** The choices of each choice field by field key. Missing fields have no choices. */
  readonly choicesByFieldKey: ChoicesByFieldKey;
  /** The current instant, from Effect Clock, that relative dates count from. */
  readonly now: Temporal.Instant;
  /** The IANA zone whose local date is `today`. */
  readonly timeZone: string;
}

function impliesCompleted(filters: ReadonlyArray<FieldFilter>): boolean {
  return filters.some(
    (filter) =>
      filter.fieldKey === "completed" &&
      filter.operator === "equals" &&
      filter.value?.kind === "boolean" &&
      filter.value.value,
  );
}

function success(
  words: ReadonlyArray<string>,
  bound: ReadonlyArray<BoundClause>,
): QueryParseResult {
  const filters = bound.map((clause) => clause.filter);
  const quotedWords = words.map(quoteIfNeeded);
  const join = (clauses: ReadonlyArray<string>) => [...quotedWords, ...clauses].join(" ");
  return {
    text: words.length === 0 ? null : words.join(" "),
    filters,
    stableText: join(bound.map((clause) => clause.stableText)),
    displayText: join(bound.map((clause) => clause.displayText)),
    impliesIncludeCompleted: impliesCompleted(filters),
    errors: [],
  };
}

function failure(errors: ReadonlyArray<QueryParseError>): QueryParseResult {
  return {
    text: null,
    filters: [],
    stableText: "",
    displayText: "",
    impliesIncludeCompleted: false,
    errors: errors.toSorted((left, right) => left.position - right.position),
  };
}

/**
 * Parses the text query syntax, such as `type:error priority>=high due<today "deadlock"`,
 * into free text and field filters for the fields in scope. Mistakes become positioned
 * errors, all reported together, and never exceptions (§7.7).
 */
export function parseItemQuery(text: string | null, context: QuerySyntaxContext): QueryParseResult {
  const scan = scanQuery(text ?? "");
  const errors = [...scan.errors];
  const today = toFloating(context.now, context.timeZone).toPlainDate();
  const reader = queryValueReader(today, context.choicesByFieldKey);
  const bind = queryClauseBinder(context.fields, reader, errors);
  const bound = scan.clauses.map(bind).filter((clause) => clause !== null);
  return errors.length > 0 ? failure(errors) : success(scan.words, bound);
}

/** The distinct lower-case keys written in `text`, so callers load only the choices needed. */
export function queryClauseKeys(text: string | null): ReadonlyArray<string> {
  const keys = scanQuery(text ?? "").clauses.map((clause) => toLowerInvariant(clause.key));
  return [...new Set(keys)];
}
