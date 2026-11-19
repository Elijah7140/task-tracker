import type {
  FieldFilter,
  FilterOperator,
  FilterValue,
  SearchableField,
  SearchChoice,
} from "@task-tracker/contracts";

type Field = typeof SearchableField.Type;
type Operator = typeof FilterOperator.Type;
type Value = typeof FilterValue.Type;
type Filter = typeof FieldFilter.Type;

/** A chosen choice and its rank, which orders priority ranges. */
export interface ChosenChoice {
  readonly id: string;
  readonly sortOrder: number;
}

/** Editable state for one filter row in the Search filter builder. */
export interface FilterRowDraft {
  readonly id: string;
  /** The field as listed when it was chosen, or null for a blank row. */
  readonly field: Field | null;
  readonly operator: Operator | null;
  /** Text, number or date input for the value or the start of a range. */
  readonly first: string;
  /** Number or date input for the end of a range. */
  readonly second: string;
  readonly booleanValue: boolean;
  readonly firstChoice: ChosenChoice | null;
  readonly secondChoice: ChosenChoice | null;
}

/**
 * A row's state. Search runs only when every row is complete. An invalid row also
 * explains why beside the row.
 */
export type FilterRowEvaluation =
  | { readonly kind: "incomplete" }
  | { readonly kind: "invalid"; readonly error: string }
  | { readonly kind: "complete"; readonly filter: Filter };

type ValueOutcome = Value | { readonly error: string } | null;

const REVERSED_RANGE = "The first value must not be after the second.";

const ISO_DATE = /^(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;

const isPriority = (field: Field) => field.fieldDefinitionId === null && field.key === "priority";

/** Field-adapted wording for an operator, matching the legacy operator labels. */
export function operatorLabelFor(field: Field, operator: Operator): string {
  const ordered = isPriority(field)
    ? (["more important than", "less important than"] as const)
    : field.dataType === "Date"
      ? (["after", "before"] as const)
      : (["greater than", "less than"] as const);
  const labels: Record<Operator, string> = {
    equals: "is",
    notEquals: "is not",
    contains: "contains",
    greaterThan: ordered[0],
    lessThan: ordered[1],
    between: "between",
    isEmpty: "is empty",
    isNotEmpty: "is not empty",
  };
  return labels[operator];
}

/** A blank row, or one set to `field` with its first operator and no values. */
export function createFilterRowDraft(id: string, field?: Field): FilterRowDraft {
  return {
    id,
    field: field ?? null,
    operator: field?.operators[0] ?? null,
    first: "",
    second: "",
    booleanValue: false,
    firstChoice: null,
    secondChoice: null,
  };
}

/** True when the operator takes no value. */
export const isPresenceOperator = (operator: Operator | null) =>
  operator === "isEmpty" || operator === "isNotEmpty";

function parseNumber(text: string): number | null | undefined {
  if (text.trim() === "") {
    return null;
  }
  const parsed = Number(text.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberValue(row: FilterRowDraft): ValueOutcome {
  const first = parseNumber(row.first);
  const second = row.operator === "between" ? parseNumber(row.second) : 0;
  if (first === undefined || second === undefined) {
    return { error: "Enter a valid number." };
  }
  if (first === null || second === null) {
    return null;
  }
  if (row.operator !== "between") {
    return { kind: "number", value: first };
  }
  return first > second
    ? { error: REVERSED_RANGE }
    : { kind: "numberRange", min: first, max: second };
}

function dateValue(row: FilterRowDraft): ValueOutcome {
  const complete =
    ISO_DATE.test(row.first) && (row.operator !== "between" || ISO_DATE.test(row.second));
  if (!complete) {
    return null;
  }
  if (row.operator !== "between") {
    return { kind: "date", value: row.first };
  }
  return row.first > row.second
    ? { error: REVERSED_RANGE }
    : { kind: "dateRange", min: row.first, max: row.second };
}

function choiceValue(row: FilterRowDraft): ValueOutcome {
  const { firstChoice, secondChoice } = row;
  if (firstChoice === null) {
    return null;
  }
  if (row.operator !== "between") {
    return { kind: "choice", id: firstChoice.id };
  }
  if (secondChoice === null) {
    return null;
  }
  return firstChoice.sortOrder > secondChoice.sortOrder
    ? { error: "Put the more important priority first." }
    : { kind: "choiceRange", min: firstChoice.id, max: secondChoice.id };
}

function rowValue(row: FilterRowDraft, field: Field): ValueOutcome {
  switch (field.dataType) {
    case "Text":
      return row.first.trim() === "" ? null : { kind: "text", value: row.first };
    case "Number":
      return numberValue(row);
    case "Date":
      return dateValue(row);
    case "Boolean":
      return { kind: "boolean", value: row.booleanValue };
    case "Choice":
      return choiceValue(row);
  }
}

/** True when two listings describe the same field, so a row on it can stay. */
export const isSameField = (left: Field, right: Field) =>
  left.key === right.key &&
  left.dataType === right.dataType &&
  left.fieldDefinitionId === right.fieldDefinitionId;

/** Evaluates a row against its field so Search sends only finished, valid filters. */
export function evaluateFilterRow(
  row: FilterRowDraft,
  field: Field | undefined,
): FilterRowEvaluation {
  if (field === undefined || row.operator === null) {
    return { kind: "incomplete" };
  }
  const { operator } = row;
  const value = isPresenceOperator(operator) ? null : rowValue(row, field);
  if (value !== null && "error" in value) {
    return { kind: "invalid", error: value.error };
  }
  if (value === null && !isPresenceOperator(operator)) {
    return { kind: "incomplete" };
  }
  return { kind: "complete", filter: { fieldKey: field.key, operator, value } };
}

function chosen(id: string, choices: ReadonlyArray<typeof SearchChoice.Type>): ChosenChoice {
  return { id, sortOrder: choices.find((choice) => choice.id === id)?.sortOrder ?? 0 };
}

function valuePatch(
  value: Value,
  choices: ReadonlyArray<typeof SearchChoice.Type>,
): Partial<FilterRowDraft> {
  switch (value.kind) {
    case "text":
    case "date":
      return { first: value.value };
    case "number":
      return { first: String(value.value) };
    case "boolean":
      return { booleanValue: value.value };
    case "choice":
      return { firstChoice: chosen(value.id, choices) };
    case "numberRange":
    case "dateRange":
      return { first: String(value.min), second: String(value.max) };
    case "choiceRange":
      return { firstChoice: chosen(value.min, choices), secondChoice: chosen(value.max, choices) };
  }
}

/**
 * A row that evaluates to `filter`, as the query box rebuilds the filter builder from
 * parsed text (§7.7). `choices` gives choice ranks for priority ranges.
 */
export function filterRowDraftFromFilter(
  id: string,
  filter: Filter,
  field: Field,
  choices: ReadonlyArray<typeof SearchChoice.Type>,
): FilterRowDraft {
  const draft = { ...createFilterRowDraft(id, field), operator: filter.operator };
  return filter.value === null ? draft : { ...draft, ...valuePatch(filter.value, choices) };
}
