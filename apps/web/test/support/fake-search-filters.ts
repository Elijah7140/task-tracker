import type { FieldFilter, SearchableField } from "@task-tracker/contracts";
import type { FakeItemNode } from "./fake-area-items.js";

type Filter = typeof FieldFilter.Type;
type Field = typeof SearchableField.Type;
type Item = FakeItemNode["item"];
type Value = string | number | boolean | null;

/** A link the fake treats as attached to an item. */
export interface FakeLink {
  readonly url: string;
  readonly title: string | null;
}

/** Lookups the fake needs to read an item's built-in and custom values. */
export interface FakeFilterContext {
  readonly statusName: (id: string) => string | null;
  readonly priorityRank: (id: string) => number | undefined;
  readonly customValue: (itemId: string, fieldId: string) => Value;
  readonly links: (itemId: string) => ReadonlyArray<FakeLink>;
}

/** Folds case like the server's `tt_fold`, including every sigma form. */
export const foldText = (value: string) => value.toUpperCase().toLowerCase().replaceAll("ς", "σ");

function builtInValue(item: Item, key: string, context: FakeFilterContext): Value {
  switch (key) {
    case "title":
      return item.title;
    case "ticket":
      return item.ticketNumber;
    case "type":
      return item.itemTypeId;
    case "priority":
      return item.priorityLevelId;
    case "due":
      return item.dueDate;
    case "status":
      return item.statusId === null ? null : context.statusName(item.statusId);
    default:
      return item.completedAtUtc !== null;
  }
}

function compareText(actual: string, filter: Filter): boolean {
  const expected = filter.value?.kind === "text" ? foldText(filter.value.value.trim()) : "";
  const folded = foldText(actual);
  if (filter.operator === "contains") {
    return folded.includes(expected);
  }
  return filter.operator === "equals" ? folded === expected : folded !== expected;
}

function compareOrdered(actual: Value, filter: Filter, rank: (value: Value) => Value): boolean {
  const value = filter.value;
  if (value === null) {
    return false;
  }
  if (value.kind === "numberRange" || value.kind === "dateRange" || value.kind === "choiceRange") {
    // Negated priority ranks run from the more important endpoint downwards.
    const [min, max] =
      value.kind === "choiceRange" ? [rank(value.max), rank(value.min)] : [value.min, value.max];
    return min !== null && max !== null && rank(actual)! >= min && rank(actual)! <= max;
  }
  const expected = value.kind === "choice" ? value.id : value.value;
  switch (filter.operator) {
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "greaterThan":
      return rank(actual)! > rank(expected)!;
    default:
      return rank(actual)! < rank(expected)!;
  }
}

function compareValue(actual: Value, filter: Filter, field: Field, context: FakeFilterContext) {
  if (filter.operator === "isEmpty" || filter.operator === "isNotEmpty") {
    return (actual === null) === (filter.operator === "isEmpty");
  }
  if (actual === null) {
    return false;
  }
  if (typeof actual === "string" && field.dataType === "Text") {
    return compareText(actual, filter);
  }
  // A lower priority sort order is more important, so negate it for ordered comparisons.
  const isPriority = field.fieldDefinitionId === null && field.key === "priority";
  const rank = (value: Value) =>
    isPriority && typeof value === "string" ? -(context.priorityRank(value) ?? Number.NaN) : value;
  return compareOrdered(actual, filter, rank);
}

function matchesLinks(links: ReadonlyArray<FakeLink>, filter: Filter): boolean {
  if (filter.operator === "isEmpty" || filter.operator === "isNotEmpty") {
    return (links.length === 0) === (filter.operator === "isEmpty");
  }
  return links.some(
    (link) => compareText(link.url, filter) || compareText(link.title ?? "", filter),
  );
}

/** Applies one validated filter to an item the way the server's SQL does (§7.2). */
export function matchesFilter(
  item: Item,
  filter: Filter,
  field: Field,
  context: FakeFilterContext,
) {
  if (field.fieldDefinitionId !== null) {
    return compareValue(
      context.customValue(item.id, field.fieldDefinitionId),
      filter,
      field,
      context,
    );
  }
  if (field.key === "link") {
    return matchesLinks(context.links(item.id), filter);
  }
  if (
    field.key === "completed" &&
    filter.operator !== "equals" &&
    filter.operator !== "notEquals"
  ) {
    return filter.operator === "isNotEmpty";
  }
  return compareValue(builtInValue(item, field.key, context), filter, field, context);
}
