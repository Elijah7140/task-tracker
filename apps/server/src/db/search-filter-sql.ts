import {
  foldSearchText,
  isBuiltInSearchField,
  type FieldDataType,
  type FieldFilter,
  type FilterValue,
  type SearchableField,
} from "@task-tracker/core";
import type { SQLInputValue } from "node:sqlite";
import { REMINDER_ELIGIBLE_SQL } from "./reminder-sql.js";

/** Adds a bound parameter and returns its placeholder. */
export type BindParameter = (value: SQLInputValue) => string;

const COMPARISONS = {
  equals: "=",
  notEquals: "<>",
  greaterThan: ">",
  lessThan: "<",
} as const;

const CUSTOM_COLUMNS: Record<FieldDataType, string> = {
  Text: "v.TextValue",
  Number: "v.NumberValue",
  Date: "v.DateValue",
  Boolean: "v.BoolValue",
  Choice: "v.ChoiceId",
};

const LINKS = "SELECT 1 FROM ItemLink l WHERE l.ItemId = t.Id";
const PRIORITY_RANK = "(SELECT SortOrder FROM PriorityLevel WHERE Id = t.PriorityLevelId)";

/**
 * Translates one validated filter into a SQL condition on `TodoItem t` (§7.2).
 * Built-in fields compare item columns; custom fields use `EXISTS` on `ItemFieldValue`.
 * Every comparison other than IsEmpty requires a present value.
 */
export function filterSql(field: SearchableField, filter: FieldFilter, bind: BindParameter) {
  return isBuiltInSearchField(field)
    ? builtInFilter(filter, bind)
    : customFilter(field.fieldDefinitionId!, field.dataType, filter, bind);
}

function builtInFilter(filter: FieldFilter, bind: BindParameter): string {
  switch (filter.fieldKey) {
    case "title":
      return textFilter("t.Title", filter, bind);
    case "ticket":
      return textFilter("t.TicketNumber", filter, bind);
    case "type":
      return scalarFilter("t.ItemTypeId", filter, bind);
    case "priority":
      return priorityFilter(filter, bind);
    case "due":
      return scalarFilter("t.DueDate", filter, bind);
    case "scheduled":
      return scalarFilter("substr(t.ScheduledStart, 1, 10)", filter, bind, "t.ScheduledStart");
    case "status":
      return textFilter("(SELECT s.Name FROM StatusLevel s WHERE s.Id = t.StatusId)", filter, bind);
    case "completed":
      return booleanPresenceFilter("t.CompletedAtUtc", filter);
    case "link":
      return linkFilter(filter, bind);
    case "repeats":
      return repeatsFilter(filter);
    case "reminder":
      return reminderFilter(filter);
    default:
      throw new Error(`Unknown built-in search field '${filter.fieldKey}'.`);
  }
}

function customFilter(
  fieldId: string,
  dataType: FieldDataType,
  filter: FieldFilter,
  bind: BindParameter,
): string {
  const values = `SELECT 1 FROM ItemFieldValue v WHERE v.ItemId = t.Id AND v.FieldDefinitionId = ${bind(fieldId)}`;
  if (filter.operator === "isEmpty") {
    return `NOT EXISTS (${values})`;
  }
  if (filter.operator === "isNotEmpty") {
    return `EXISTS (${values})`;
  }
  const column = CUSTOM_COLUMNS[dataType];
  const comparison =
    dataType === "Text" ? textFilter(column, filter, bind) : scalarFilter(column, filter, bind);
  return `EXISTS (${values} AND ${comparison})`;
}

function presenceFilter(column: string, filter: FieldFilter): string | null {
  if (filter.operator === "isEmpty") {
    return `${column} IS NULL`;
  }
  return filter.operator === "isNotEmpty" ? `${column} IS NOT NULL` : null;
}

/** Folds the trimmed filter text the same way SQLite's `tt_fold` folds stored text. */
function foldedText(value: FilterValue | null): string {
  if (value?.kind !== "text") {
    throw new Error("Text filters need a text value.");
  }
  return foldSearchText(value.value.trim());
}

/** Trimmed, case-insensitive equality and literal Contains through `instr`, never LIKE. */
function textFilter(column: string, filter: FieldFilter, bind: BindParameter): string {
  const presence = presenceFilter(column, filter);
  if (presence !== null) {
    return presence;
  }
  const parameter = bind(foldedText(filter.value));
  const folded = `tt_fold(${column})`;
  const test =
    filter.operator === "contains"
      ? `instr(${folded}, ${parameter}) > 0`
      : `${folded} ${COMPARISONS[filter.operator as "equals" | "notEquals"]} ${parameter}`;
  return `${column} IS NOT NULL AND ${test}`;
}

function scalarFilter(
  column: string,
  filter: FieldFilter,
  bind: BindParameter,
  presenceColumn: string = column,
): string {
  const presence = presenceFilter(presenceColumn, filter);
  if (presence !== null) {
    return presence;
  }
  const value = filter.value!;
  if (filter.operator === "between") {
    const [min, max] = rangeBounds(value);
    return `${presenceColumn} IS NOT NULL AND ${column} BETWEEN ${bind(min)} AND ${bind(max)}`;
  }
  const comparison = COMPARISONS[filter.operator as keyof typeof COMPARISONS];
  return `${presenceColumn} IS NOT NULL AND ${column} ${comparison} ${bind(scalarValue(value))}`;
}

function rangeBounds(value: FilterValue): readonly [SQLInputValue, SQLInputValue] {
  if (value.kind === "numberRange" || value.kind === "dateRange") {
    return [value.min, value.max];
  }
  throw new Error(`Invalid range value '${value.kind}'.`);
}

function scalarValue(value: FilterValue): SQLInputValue {
  switch (value.kind) {
    case "number":
    case "date":
      return value.value;
    case "boolean":
      return value.value ? 1 : 0;
    case "choice":
      return value.id;
    default:
      throw new Error(`Invalid scalar filter value '${value.kind}'.`);
  }
}

/**
 * A Boolean derived from whether a column has a value, such as Completed. Every
 * item has the Boolean, so IsEmpty never matches and IsNotEmpty always does.
 */
function booleanPresenceFilter(column: string, filter: FieldFilter): string {
  if (filter.operator === "isEmpty") {
    return "0 = 1";
  }
  if (filter.operator === "isNotEmpty") {
    return "1 = 1";
  }
  const expected = filter.value?.kind === "boolean" && filter.value.value;
  const wantsPresent = filter.operator === "equals" ? expected : !expected;
  return wantsPresent ? `${column} IS NOT NULL` : `${column} IS NULL`;
}

/**
 * `repeats` compares rule presence (§7.11). Unlike other boolean fields, `has:repeats`
 * and `no:repeats` also test the rule, so they read like `is:recurring`.
 */
function repeatsFilter(filter: FieldFilter): string {
  return (
    presenceFilter("t.RecurrenceFrequency", filter) ??
    booleanPresenceFilter("t.RecurrenceFrequency", filter)
  );
}

/** `has:reminder` matches open items whose effective reminder is not None (§7.12). */
function reminderFilter(filter: FieldFilter): string {
  if (filter.operator === "isNotEmpty") {
    return `(${REMINDER_ELIGIBLE_SQL})`;
  }
  if (filter.operator === "isEmpty") {
    return `NOT (${REMINDER_ELIGIBLE_SQL})`;
  }
  throw new Error("The reminder field only supports presence tests.");
}

/** Matches items with a link whose address or title contains the text, case-insensitively. */
function linkFilter(filter: FieldFilter, bind: BindParameter): string {
  if (filter.operator === "isEmpty") {
    return `NOT EXISTS (${LINKS})`;
  }
  if (filter.operator === "isNotEmpty") {
    return `EXISTS (${LINKS})`;
  }
  const text = foldedText(filter.value);
  const inUrl = `instr(tt_fold(l.Url), ${bind(text)}) > 0`;
  const inTitle = `instr(tt_fold(COALESCE(l.Title, '')), ${bind(text)}) > 0`;
  return `EXISTS (${LINKS} AND (${inUrl} OR ${inTitle}))`;
}

/**
 * Priority equality compares level IDs. Ordered comparisons use the current rank,
 * where a lower sort order is more important, so GreaterThan means a lower rank.
 */
function priorityFilter(filter: FieldFilter, bind: BindParameter): string {
  if (!["greaterThan", "lessThan", "between"].includes(filter.operator)) {
    return scalarFilter("t.PriorityLevelId", filter, bind);
  }
  const rankOf = (id: string) => `(SELECT SortOrder FROM PriorityLevel WHERE Id = ${bind(id)})`;
  const value = filter.value;
  if (value?.kind === "choiceRange") {
    const range = `BETWEEN ${rankOf(value.min)} AND ${rankOf(value.max)}`;
    return `t.PriorityLevelId IS NOT NULL AND ${PRIORITY_RANK} ${range}`;
  }
  if (value?.kind !== "choice") {
    throw new Error("Invalid priority comparison value.");
  }
  const comparison = filter.operator === "greaterThan" ? "<" : ">";
  return `t.PriorityLevelId IS NOT NULL AND ${PRIORITY_RANK} ${comparison} ${rankOf(value.id)}`;
}
