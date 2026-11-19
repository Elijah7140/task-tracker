import type { FilterValue } from "../filter-value.js";
import type { FieldFilter } from "../item-query.js";
import { queryWords } from "./query-characters.js";
import { operatorSymbol } from "./query-operator-symbols.js";
import { formatChoiceValue, quoteIfNeeded } from "./query-quoting.js";
import type { ChoicesByFieldKey } from "./query-value-reader.js";

function formatChoice(fieldKey: string, id: string, choices: ChoicesByFieldKey): string {
  const match = choices.get(fieldKey)?.find((option) => option.id === id);
  return match === undefined ? `#${id}` : formatChoiceValue(match, fieldKey);
}

function formatValue(fieldKey: string, value: FilterValue, choices: ChoicesByFieldKey): string {
  switch (value.kind) {
    case "text":
      return quoteIfNeeded(value.value);
    case "number":
    case "date":
      return String(value.value);
    case "boolean":
      return value.value ? "yes" : "no";
    case "choice":
      return formatChoice(fieldKey, value.id, choices);
    case "numberRange":
    case "dateRange":
      return `${String(value.min)}..${String(value.max)}`;
    case "choiceRange":
      return `${formatChoice(fieldKey, value.min, choices)}..${formatChoice(fieldKey, value.max, choices)}`;
  }
}

function formatFilter(filter: FieldFilter, choices: ChoicesByFieldKey): string {
  const { fieldKey, operator, value } = filter;
  if (operator === "isEmpty" || operator === "isNotEmpty") {
    return `${operator === "isEmpty" ? "no" : "has"}:${fieldKey}`;
  }
  const flag = operator === "equals" && value?.kind === "boolean" ? value.value : null;
  if (fieldKey === "repeats" && flag === true) {
    return "is:recurring";
  }
  if (fieldKey === "completed" && flag !== null) {
    return flag ? "is:done" : "is:open";
  }
  const written = value === null ? "" : formatValue(fieldKey, value, choices);
  return `${fieldKey}${operatorSymbol(operator)}${written}`;
}

/**
 * Writes free text and filters as canonical query text: free text first, then one
 * clause per filter, with choices by label, dates as ISO and numbers in the invariant
 * culture. Parsing the result gives back the same filters (§7.7). An ID with no
 * matching choice is written as `#id`.
 */
export function formatItemQuery(
  text: string | null,
  filters: ReadonlyArray<FieldFilter>,
  choicesByFieldKey: ChoicesByFieldKey,
): string {
  const words = text === null ? [] : queryWords(text).map(quoteIfNeeded);
  const clauses = filters.map((filter) => formatFilter(filter, choicesByFieldKey));
  return [...words, ...clauses].join(" ");
}
