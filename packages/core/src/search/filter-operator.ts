/** Supported search filter operators (§7.2). */
export const FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "greaterThan",
  "lessThan",
  "between",
  "contains",
  "isEmpty",
  "isNotEmpty",
] as const;

/** An operation applied to one search field. */
export type FilterOperator = (typeof FILTER_OPERATORS)[number];
