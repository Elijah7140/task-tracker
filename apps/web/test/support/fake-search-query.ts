import {
  type FieldFilter,
  type FilterValue,
  type QueryParseError,
  RuleViolation,
  type SearchableField,
  type SearchChoice,
  type SearchScope,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import { listChoices, listFields, type SearchStore } from "./fake-search-handlers.js";

type Field = typeof SearchableField.Type;
type Choice = typeof SearchChoice.Type;
type Filter = typeof FieldFilter.Type;
type Value = typeof FilterValue.Type;
type ParseError = typeof QueryParseError.Type;
type Scope = typeof SearchScope.Type;
type Operator = Filter["operator"];

/** The fake server's local date for relative query dates. */
export const FAKE_QUERY_TODAY = "2026-11-13";

const TOKEN = /"(?:\\.|[^"\\])*"|"[^]*$|\S+/g;
const CLAUSE = /^([\p{L}\p{Nd}_-]+)(!=|>=|<=|:|>|<|~)([^]*)$/u;
const SYMBOLS: Record<string, Operator> = {
  ":": "equals",
  "!=": "notEquals",
  "~": "contains",
  ">": "greaterThan",
  "<": "lessThan",
  ">=": "between",
  "<=": "between",
};
const RELATIVE_DATES: Record<string, string> = {
  today: FAKE_QUERY_TODAY,
  tomorrow: "2026-11-14",
  yesterday: "2026-11-12",
};

interface Token {
  readonly text: string;
  readonly position: number;
}

const unquote = (text: string) =>
  text.startsWith('"') ? text.slice(1, -1).replace(/\\(["\\])/g, "$1") : text;

const quoteIfNeeded = (text: string) =>
  /[\s"\\:~<>!]|\.\./.test(text) || text === ""
    ? `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    : text;

function distance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, (_, row) => [row]);
  for (let column = 1; column <= right.length; column++) {
    rows[0]![column] = column;
  }
  for (let row = 1; row <= left.length; row++) {
    for (let column = 1; column <= right.length; column++) {
      const replace = rows[row - 1]![column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1);
      rows[row]![column] = Math.min(
        replace,
        rows[row - 1]![column]! + 1,
        rows[row]![column - 1]! + 1,
      );
    }
  }
  return rows[left.length]![right.length]!;
}

function unknownField(key: string, fields: ReadonlyArray<Field>) {
  const near = fields.find((field) => distance(key.toLowerCase(), field.key) <= 2);
  return near === undefined
    ? `Unknown field '${key}'. Fields you can use: ${fields.map((field) => field.key).join(", ")}.`
    : `Unknown field '${key}'. Did you mean '${near.key}'?`;
}

function readDate(text: string): Value | string {
  const relative = RELATIVE_DATES[text.toLowerCase()];
  if (relative !== undefined) {
    return { kind: "date", value: relative };
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? { kind: "date", value: text }
    : `'${text}' is not a date. Use yyyy-MM-dd, today, tomorrow, yesterday, or an offset like +3d or -1w.`;
}

function readChoice(field: Field, text: string, choices: ReadonlyArray<Choice>): Choice | string {
  if (text.startsWith("#")) {
    const byId = choices.find((choice) => `#${choice.id}` === text.toUpperCase());
    return byId ?? `That ${field.displayName} choice no longer exists.`;
  }
  const found = choices.find((choice) => choice.label.toLowerCase() === text.toLowerCase());
  const labels = choices.map((choice) => choice.label).join(", ");
  return found ?? `'${text}' is not a ${field.displayName} choice. Choose one of: ${labels}.`;
}

function readSingle(field: Field, text: string, choices: ReadonlyArray<Choice>): Value | string {
  switch (field.dataType) {
    case "Text":
      return { kind: "text", value: text };
    case "Number":
      return Number.isFinite(Number(text))
        ? { kind: "number", value: Number(text) }
        : `'${text}' is not a number. Write decimals with a dot, like 2.5.`;
    case "Date":
      return readDate(text);
    case "Boolean":
      return /^(yes|true)$/i.test(text)
        ? { kind: "boolean", value: true }
        : { kind: "boolean", value: false };
    case "Choice": {
      const choice = readChoice(field, text, choices);
      return typeof choice === "string" ? choice : { kind: "choice", id: choice.id };
    }
  }
}

function readRange(field: Field, low: Value, text: string, choices: ReadonlyArray<Choice>) {
  const high = readSingle(field, text, choices);
  if (typeof high === "string") {
    return high;
  }
  if (low.kind === "choice" && high.kind === "choice") {
    return { kind: "choiceRange", min: low.id, max: high.id } satisfies Value;
  }
  if (low.kind === "number" && high.kind === "number") {
    return { kind: "numberRange", min: low.value, max: high.value } satisfies Value;
  }
  if (low.kind === "date" && high.kind === "date") {
    return { kind: "dateRange", min: low.value, max: high.value } satisfies Value;
  }
  return "The first value must not be after the second.";
}

function readValue(field: Field, symbol: string, raw: string, choices: ReadonlyArray<Choice>) {
  const [first, second] = raw.split("..").map(unquote);
  if (first === undefined || first.trim() === "") {
    return "A value is needed here.";
  }
  const low = readSingle(field, first, choices);
  if (typeof low === "string") {
    return low;
  }
  if (second !== undefined) {
    return readRange(field, low, second, choices);
  }
  if (low.kind !== "choice" || (symbol !== ">=" && symbol !== "<=")) {
    return low;
  }
  const [top, bottom] = [choices[0]!.id, choices.at(-1)!.id];
  return symbol === ">="
    ? ({ kind: "choiceRange", min: top, max: low.id } satisfies Value)
    : ({ kind: "choiceRange", min: low.id, max: bottom } satisfies Value);
}

function bindClause(
  store: SearchStore,
  fields: ReadonlyArray<Field>,
  [, key, symbol, raw]: RegExpExecArray,
): Filter | string {
  const keyword = key!.toLowerCase();
  if (symbol === ":" && (keyword === "has" || keyword === "no")) {
    const field = fields.find((candidate) => candidate.key === raw!.toLowerCase());
    const operator = keyword === "has" ? "isNotEmpty" : "isEmpty";
    return field === undefined
      ? unknownField(raw!, fields)
      : { fieldKey: field.key, operator, value: null };
  }
  if (symbol === ":" && keyword === "is") {
    const done = /^(done|completed)$/i.test(raw!);
    return { fieldKey: "completed", operator: "equals", value: { kind: "boolean", value: done } };
  }
  const field = fields.find((candidate) => candidate.key === keyword);
  if (field === undefined) {
    return unknownField(key!, fields);
  }
  const operator = raw!.includes("..") ? "between" : SYMBOLS[symbol!]!;
  if (!field.operators.includes(operator)) {
    return `${field.displayName} ('${field.key}') does not support '${symbol}'.`;
  }
  const choices = field.dataType === "Choice" ? listChoices(store, field) : [];
  const value = readValue(field, symbol!, raw!, choices);
  return typeof value === "string" ? value : { fieldKey: field.key, operator, value };
}

function describe(error: Omit<ParseError, "description">, text: string): ParseError {
  const token = text.slice(error.position, error.position + error.length);
  return {
    ...error,
    description: `${error.message} (at "${token}", character ${error.position + 1})`,
  };
}

function tokenize(text: string): ReadonlyArray<Token> {
  return Array.from(text.matchAll(TOKEN), (match) => ({ text: match[0], position: match.index }));
}

/**
 * A small stand-in for the server's query parser: words, quoted phrases, `key op value`,
 * `a..b` ranges, `has:`, `no:` and `is:`, with positioned errors and descriptions.
 */
export function fakeParseQuery(store: SearchStore, scope: Scope, text: string) {
  const fields = listFields(store, scope);
  const words: Array<string> = [];
  const filters: Array<Filter> = [];
  const errors: Array<ParseError> = [];
  for (const token of tokenize(text)) {
    const fail = (message: string) =>
      errors.push(describe({ position: token.position, length: token.text.length, message }, text));
    if (token.text.startsWith('"') && (token.text.length < 2 || !token.text.endsWith('"'))) {
      fail("A quote was opened but never closed.");
      continue;
    }
    const clause = token.text.startsWith('"') ? null : CLAUSE.exec(token.text);
    const bound = clause === null ? null : bindClause(store, fields, clause);
    if (typeof bound === "string") {
      fail(bound);
    } else if (bound === null) {
      words.push(unquote(token.text));
    } else {
      filters.push(bound);
    }
  }
  if (errors.length > 0) {
    return { kind: "invalid" as const, errors };
  }
  const choiceFields = fields.filter(
    (field) =>
      field.dataType === "Choice" && filters.some((filter) => filter.fieldKey === field.key),
  );
  const freeText = words.join(" ") || null;
  return {
    kind: "parsed" as const,
    text: freeText,
    filters,
    stableText: fakeFormatQuery(store, scope, freeText, filters, { stable: true }),
    displayText: fakeFormatQuery(store, scope, freeText, filters),
    impliesIncludeCompleted: filters.some(
      (filter) =>
        filter.fieldKey === "completed" && filter.value?.kind === "boolean" && filter.value.value,
    ),
    choices: choiceFields.map((field) => ({
      fieldKey: field.key,
      choices: listChoices(store, field),
    })),
  };
}

function formatValue(value: Value, choices: ReadonlyArray<Choice>, stable: boolean): string {
  const label = (id: string) =>
    stable
      ? `#${id}`
      : quoteIfNeeded(choices.find((choice) => choice.id === id)?.label ?? `#${id}`);
  switch (value.kind) {
    case "text":
      return quoteIfNeeded(value.value);
    case "choice":
      return label(value.id);
    case "choiceRange":
      return `${label(value.min)}..${label(value.max)}`;
    case "boolean":
      return value.value ? "yes" : "no";
    case "numberRange":
    case "dateRange":
      return `${value.min}..${value.max}`;
    default:
      return String(value.value);
  }
}

const OPERATOR_SYMBOLS: Record<Operator, string> = {
  equals: ":",
  notEquals: "!=",
  contains: "~",
  greaterThan: ">",
  lessThan: "<",
  between: ":",
  isEmpty: ":",
  isNotEmpty: ":",
};

/**
 * A stand-in for the server's canonical query formatter. The stable form writes
 * choices as `#id`, as saved searches store them.
 */
export function fakeFormatQuery(
  store: SearchStore,
  scope: Scope,
  text: string | null,
  filters: ReadonlyArray<Filter>,
  { stable = false }: { readonly stable?: boolean } = {},
): string {
  const fields = listFields(store, scope);
  const clauses = filters.map(({ fieldKey, operator, value }) => {
    if (value === null) {
      return `${operator === "isEmpty" ? "no" : "has"}:${fieldKey}`;
    }
    if (fieldKey === "completed" && value.kind === "boolean") {
      return value.value ? "is:done" : "is:open";
    }
    const field = fields.find((candidate) => candidate.key === fieldKey);
    const choices = field?.dataType === "Choice" ? listChoices(store, field) : [];
    return `${fieldKey}${OPERATOR_SYMBOLS[operator]}${formatValue(value, choices, stable)}`;
  });
  const words = (text ?? "")
    .split(/\s+/)
    .filter((word) => word !== "")
    .map(quoteIfNeeded);
  return [...words, ...clauses].join(" ");
}

/** Fake handlers for the Search query box (§7.7). */
export function searchQueryHandlers(store: SearchStore) {
  return {
    ParseSearchQuery: ({ scope, text }: { readonly scope: Scope; readonly text: string }) =>
      store
        .record("ParseSearchQuery")
        .pipe(
          Effect.andThen(() =>
            scope.kind === "allProjects" ||
            store.summaries.some(({ project }) => project.id === scope.projectId)
              ? Effect.succeed(fakeParseQuery(store, scope, text))
              : Effect.fail(new RuleViolation({ message: "Search project does not exist." })),
          ),
        ),
    FormatSearchQuery: ({
      scope,
      text,
      filters,
    }: {
      readonly scope: Scope;
      readonly text: string | null;
      readonly filters: ReadonlyArray<Filter>;
    }) =>
      store
        .record("FormatSearchQuery")
        .pipe(Effect.as(fakeFormatQuery(store, scope, text, filters))),
  };
}
