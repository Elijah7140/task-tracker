import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { FilterOperator } from "./filter-operator.js";
import type { FilterValue } from "./filter-value.js";
import type { FieldFilter, ItemQuery } from "./item-query.js";
import { searchOperatorsFor } from "./search-operators.js";
import {
  isBuiltInSearchField,
  type SearchableField,
  type SearchChoice,
} from "./searchable-field.js";

const ISO_DATE_PATTERN = /^(?!0000)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;

function isValidIsoDate(text: string): boolean {
  if (!ISO_DATE_PATTERN.test(text)) {
    return false;
  }
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 2) {
    return day <= (leapYear ? 29 : 28);
  }
  return day <= ([4, 6, 9, 11].includes(month) ? 30 : 31);
}

function validateOrderedValue(
  operator: FilterOperator,
  value: FilterValue | null,
  isNumber: boolean,
): boolean {
  const isRange = operator === "between";
  if (isNumber) {
    if (isRange) {
      return (
        value?.kind === "numberRange" &&
        Number.isFinite(value.min) &&
        Number.isFinite(value.max) &&
        value.min <= value.max
      );
    }
    return value?.kind === "number" && Number.isFinite(value.value);
  }
  if (isRange) {
    return (
      value?.kind === "dateRange" &&
      isValidIsoDate(value.min) &&
      isValidIsoDate(value.max) &&
      value.min <= value.max
    );
  }
  return value?.kind === "date" && isValidIsoDate(value.value);
}

function validateChoiceShape(field: SearchableField, filter: FieldFilter): boolean {
  if (isBuiltInSearchField(field) && field.key === "priority" && filter.operator === "between") {
    return filter.value?.kind === "choiceRange";
  }
  return filter.value?.kind === "choice";
}

function hasValidValue(field: SearchableField, filter: FieldFilter): boolean {
  switch (field.dataType) {
    case "Text":
      return filter.value?.kind === "text";
    case "Number":
      return validateOrderedValue(filter.operator, filter.value, true);
    case "Date":
      return validateOrderedValue(filter.operator, filter.value, false);
    case "Boolean":
      return filter.value?.kind === "boolean";
    case "Choice":
      return validateChoiceShape(field, filter);
  }
}

function validateChoiceMembership(
  field: SearchableField,
  value: FilterValue | null,
  choices: ReadonlyArray<SearchChoice>,
): void {
  if (value?.kind !== "choice" && value?.kind !== "choiceRange") {
    return;
  }
  const byId = new Map(choices.map((option) => [option.id, option]));
  const ids = value.kind === "choice" ? [value.id] : [value.min, value.max];
  if (ids.some((id) => !byId.has(id))) {
    throw new MetadataRuleError(`Choice does not belong to search field '${field.key}'.`);
  }
  if (value.kind === "choiceRange") {
    const minRank = byId.get(value.min)!.sortOrder;
    const maxRank = byId.get(value.max)!.sortOrder;
    if (minRank > maxRank) {
      throw new MetadataRuleError("Priority range must run from more important to less important.");
    }
  }
}

/** Validated registry metadata supplied to {@link validateItemQuery}. */
export interface QueryValidationContext {
  readonly fields: ReadonlyArray<SearchableField>;
  readonly choicesByFieldKey: ReadonlyMap<string, ReadonlyArray<SearchChoice>>;
}

/** Rejects unknown fields, invalid operators, malformed values and bad ranges (§7.2). */
export function validateItemQuery(query: ItemQuery, context: QueryValidationContext): void {
  const byKey = new Map(context.fields.map((field) => [field.key, field]));
  for (const filter of query.filters) {
    const field = byKey.get(filter.fieldKey);
    if (field === undefined) {
      throw new MetadataRuleError(`Unknown search field '${filter.fieldKey}'.`);
    }
    if (!searchOperatorsFor(field).includes(filter.operator)) {
      throw new MetadataRuleError(`Invalid operator for search field '${field.key}'.`);
    }
    if (filter.operator === "isEmpty" || filter.operator === "isNotEmpty") {
      if (filter.value !== null) {
        throw new MetadataRuleError(`'${field.key}' does not take a value for ${filter.operator}.`);
      }
      continue;
    }
    if (!hasValidValue(field, filter)) {
      throw new MetadataRuleError(`Invalid operator or value for search field '${field.key}'.`);
    }
    validateChoiceMembership(field, filter.value, context.choicesByFieldKey.get(field.key) ?? []);
  }
}
