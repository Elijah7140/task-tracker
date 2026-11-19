import type { FilterOperator } from "../filter-operator.js";
import type { FilterValue } from "../filter-value.js";
import type { FieldFilter } from "../item-query.js";
import { searchOperatorsFor } from "../search-operators.js";
import { isBuiltInSearchField, type SearchableField } from "../searchable-field.js";
import { foldSearchText } from "../text-folding.js";
import { toLowerInvariant, trimQueryText } from "./query-characters.js";
import { isInQueryDateDomain } from "./query-dates.js";
import { suggestQueryKey } from "./query-key-suggester.js";
import { describeOperatorSymbol, operatorForSymbol } from "./query-operator-symbols.js";
import type { QueryParseError } from "./query-parse-error.js";
import type { QueryClause } from "./query-scanner.js";
import type { queryValueReader, ValueOutcome } from "./query-value-reader.js";

/** Words the syntax gives a meaning of their own as `has:`, `no:` and `is:` (§7.7). */
export const QUERY_KEYWORDS: ReadonlyArray<string> = ["has", "no", "is"];

/** A clause matched to a field: the filter it means, with its stable and display spellings. */
export interface BoundClause {
  readonly filter: FieldFilter;
  readonly stableText: string;
  readonly displayText: string;
}

type ValueReader = ReturnType<typeof queryValueReader>;
type ReadValue = Extract<ValueOutcome, { ok: true }>;

const fixed = (filter: FieldFilter, text: string): BoundClause => ({
  filter,
  stableText: text,
  displayText: text,
});

const written = (
  field: SearchableField,
  operator: FilterOperator,
  value: FilterValue,
  symbol: string,
  outcome: ReadValue,
): BoundClause => ({
  filter: { fieldKey: field.key, operator, value },
  stableText: `${field.key}${symbol}${outcome.stable}`,
  displayText: `${field.key}${symbol}${outcome.display}`,
});

/** The date a Date field's read value holds; the reader guarantees the kind. */
function plainDateOf(value: FilterValue): Temporal.PlainDate {
  if (value.kind !== "date") {
    throw new TypeError("Expected a date value.");
  }
  return Temporal.PlainDate.from(value.value);
}

/** The choice a Choice field's read value names; the reader guarantees the kind. */
function choiceIdOf(value: FilterValue): string {
  if (value.kind !== "choice") {
    throw new TypeError("Expected a choice value.");
  }
  return value.id;
}

function allowedSymbols(field: SearchableField): string {
  return searchOperatorsFor(field)
    .map(describeOperatorSymbol)
    .filter((symbol) => symbol !== null)
    .join(", ");
}

function shapeProblem(clause: QueryClause, field: SearchableField): string | null {
  if (clause.endpoints.length > 2) {
    return "A range has two ends, like 1..5.";
  }
  if (clause.endpoints.length === 2 && clause.symbol !== ":") {
    return "Ranges like a..b go after ':' only.";
  }
  const operator = operatorForSymbol(clause.symbol, clause.endpoints.length);
  if (!searchOperatorsFor(field).includes(operator)) {
    return (
      `${field.displayName} ('${field.key}') does not support '${clause.symbol}'. ` +
      `Use: ${allowedSymbols(field)}.`
    );
  }
  return null;
}

function bindIs(value: string): BoundClause | string {
  const word = foldSearchText(value);
  if (word === "recurring") {
    const repeats: FieldFilter = {
      fieldKey: "repeats",
      operator: "equals",
      value: { kind: "boolean", value: true },
    };
    return fixed(repeats, "is:recurring");
  }
  const wantsDone = word === "done" || word === "completed";
  if (!wantsDone && word !== "open") {
    return "'is:' takes done, open or recurring.";
  }
  const filter: FieldFilter = {
    fieldKey: "completed",
    operator: "equals",
    value: { kind: "boolean", value: wantsDone },
  };
  return fixed(filter, wantsDone ? "is:done" : "is:open");
}

/**
 * Matches scanned clauses to the fields in scope, recording an error for every clause
 * that cannot become a valid {@link FieldFilter} (§7.7).
 */
export function queryClauseBinder(
  fields: ReadonlyArray<SearchableField>,
  reader: ValueReader,
  errors: Array<QueryParseError>,
) {
  const findField = (key: string) => fields.find((field) => field.key === key);

  const fail = (clause: QueryClause, message: string) => {
    errors.push({ position: clause.start, length: clause.length, message });
    return null;
  };

  const unknownFieldMessage = (typed: string) => {
    const keys = fields.map((field) => field.key);
    const suggestion = suggestQueryKey(typed, keys);
    return suggestion === null
      ? `Unknown field '${typed}'. Fields you can use: ${keys.join(", ")}.`
      : `Unknown field '${typed}'. Did you mean '${suggestion}'?`;
  };

  const bindPresence = (clause: QueryClause, keyword: string, fieldKey: string) => {
    const field = findField(toLowerInvariant(fieldKey));
    if (field === undefined) {
      return fail(clause, unknownFieldMessage(fieldKey));
    }
    const operator = keyword === "has" ? "isNotEmpty" : "isEmpty";
    return fixed({ fieldKey: field.key, operator, value: null }, `${keyword}:${field.key}`);
  };

  const bindKeyword = (clause: QueryClause, keyword: string) => {
    if (clause.endpoints.length !== 1) {
      return fail(clause, `'${keyword}:' takes one value.`);
    }
    const value = trimQueryText(clause.endpoints[0]!.value);
    if (keyword !== "is") {
      return bindPresence(clause, keyword, value);
    }
    const bound = bindIs(value);
    return typeof bound === "string" ? fail(clause, bound) : bound;
  };

  /** Dates are whole days, so `due>=D` is exactly `due>D-1 day`. */
  const bindInclusiveDate = (clause: QueryClause, field: SearchableField) => {
    const outcome = reader.read(field, clause.endpoints[0]!);
    if (!outcome.ok) {
      return fail(clause, outcome.error);
    }
    const isGreater = clause.symbol === ">=";
    const edge = plainDateOf(outcome.value).add({ days: isGreater ? -1 : 1 });
    if (!isInQueryDateDomain(edge)) {
      const filter: FieldFilter = { fieldKey: field.key, operator: "isNotEmpty", value: null };
      return fixed(filter, `${field.key}${clause.symbol}${outcome.stable}`);
    }
    const operator = isGreater ? "greaterThan" : "lessThan";
    const value: FilterValue = { kind: "date", value: edge.toString() };
    return written(field, operator, value, clause.symbol, outcome);
  };

  /** Priority is ranked, so `priority>=high` is the range from the top level down to High. */
  const bindInclusivePriority = (clause: QueryClause, field: SearchableField) => {
    const outcome = reader.read(field, clause.endpoints[0]!);
    if (!outcome.ok) {
      return fail(clause, outcome.error);
    }
    const picked = choiceIdOf(outcome.value);
    const ranked = reader.optionsFor(field).toSorted((a, b) => a.sortOrder - b.sortOrder);
    const value: FilterValue =
      clause.symbol === ">="
        ? { kind: "choiceRange", min: ranked[0]!.id, max: picked }
        : { kind: "choiceRange", min: picked, max: ranked.at(-1)!.id };
    return written(field, "between", value, clause.symbol, outcome);
  };

  const bindInclusive = (clause: QueryClause, field: SearchableField) => {
    if (field.dataType === "Date") {
      return bindInclusiveDate(clause, field);
    }
    if (isBuiltInSearchField(field) && field.key === "priority") {
      return bindInclusivePriority(clause, field);
    }
    return fail(
      clause,
      "'>=' and '<=' work for dates and priority. For other fields use '>' or '<', or a range like 3..5.",
    );
  };

  const bindField = (clause: QueryClause, field: SearchableField) => {
    const problem = shapeProblem(clause, field);
    if (problem !== null) {
      return fail(clause, problem);
    }
    if (clause.symbol === ">=" || clause.symbol === "<=") {
      return bindInclusive(clause, field);
    }
    const [first, second] = clause.endpoints;
    const outcome =
      second === undefined ? reader.read(field, first!) : reader.readRange(field, first!, second);
    if (!outcome.ok) {
      return fail(clause, outcome.error);
    }
    const operator = operatorForSymbol(clause.symbol, clause.endpoints.length);
    return written(field, operator, outcome.value, clause.symbol, outcome);
  };

  /** Returns the bound clause, or null after recording why the clause is invalid. */
  return (clause: QueryClause): BoundClause | null => {
    const key = toLowerInvariant(clause.key);
    if (clause.symbol === ":" && QUERY_KEYWORDS.includes(key)) {
      return bindKeyword(clause, key);
    }
    const field = findField(key);
    return field === undefined
      ? fail(clause, unknownFieldMessage(clause.key))
      : bindField(clause, field);
  };
}
