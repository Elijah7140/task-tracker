import type { FilterOperator } from "../filter-operator.js";

/** The symbol written between key and value. A range uses `:` with `a..b`. */
export function operatorSymbol(operator: FilterOperator): string {
  switch (operator) {
    case "notEquals":
      return "!=";
    case "greaterThan":
      return ">";
    case "lessThan":
      return "<";
    case "contains":
      return "~";
    default:
      return ":";
  }
}

/** A short spelling for error messages, or null for operators written as `has:` and `no:`. */
export function describeOperatorSymbol(operator: FilterOperator): string | null {
  if (operator === "between") {
    return "a..b";
  }
  return operator === "isEmpty" || operator === "isNotEmpty" ? null : operatorSymbol(operator);
}

/** The filter operator a clause symbol means; `:` with two endpoints is a range. */
export function operatorForSymbol(symbol: string, endpointCount: number): FilterOperator {
  switch (symbol) {
    case ":":
      return endpointCount === 2 ? "between" : "equals";
    case "!=":
      return "notEquals";
    case ">":
    case ">=":
      return "greaterThan";
    case "<":
    case "<=":
      return "lessThan";
    default:
      return "contains";
  }
}
