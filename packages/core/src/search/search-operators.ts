import type { FilterOperator } from "./filter-operator.js";
import { isBuiltInSearchField, type SearchableField } from "./searchable-field.js";

function supportsOrderedComparison(field: SearchableField): boolean {
  const isNumberOrDate = field.dataType === "Number" || field.dataType === "Date";
  const isPriority = isBuiltInSearchField(field) && field.key === "priority";
  return isNumberOrDate || isPriority;
}

/** Returns the valid operators for `field` in display order (§7.2). */
export function searchOperatorsFor(field: SearchableField): ReadonlyArray<FilterOperator> {
  if (isBuiltInSearchField(field) && field.key === "link") {
    return ["contains", "isEmpty", "isNotEmpty"];
  }

  const operators: Array<FilterOperator> = ["equals", "notEquals"];
  if (field.dataType === "Text") {
    operators.push("contains");
  }
  if (supportsOrderedComparison(field)) {
    operators.push("greaterThan", "lessThan", "between");
  }
  operators.push("isEmpty", "isNotEmpty");
  return operators;
}
