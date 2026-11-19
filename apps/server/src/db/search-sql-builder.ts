import {
  buildFtsTerms,
  type ItemQuery,
  type SearchableField,
  type SearchScope,
} from "@task-tracker/core";
import type { SQLInputValue } from "node:sqlite";
import { filterSql, type BindParameter } from "./search-filter-sql.js";

/** Parameterized SQLite statement generated for a validated {@link ItemQuery}. */
export interface BuiltSearchSql {
  readonly sql: string;
  readonly parameters: ReadonlyArray<SQLInputValue>;
}

const SELECT_COLUMNS =
  "SELECT t.Id, t.ProjectId, p.Name AS ProjectName, t.FolderId, t.ParentItemId, " +
  "t.Title, t.TicketNumber, t.ItemTypeId, t.PriorityLevelId, t.DueDate, t.DueTime, " +
  "CASE WHEN t.CompletedAtUtc IS NULL THEN 0 ELSE 1 END AS IsCompleted, " +
  "CASE WHEN t.ScheduledStart IS NOT NULL THEN 1 ELSE 0 END AS HasSchedule, " +
  "t.StatusId " +
  "FROM TodoItem t JOIN Project p ON p.Id = t.ProjectId ";

const FTS_JOIN =
  "JOIN TodoItemSearchRow mapping ON mapping.ItemId = t.Id " +
  "JOIN TodoItemSearch ON TodoItemSearch.rowid = mapping.RowId ";

const ACTIVE_FOLDER =
  "(t.FolderId IS NULL OR EXISTS (SELECT 1 FROM Folder folder " +
  "WHERE folder.Id = t.FolderId AND folder.DeletedAtUtc IS NULL))";

/** The folder and its active descendants, for an area that includes subfolders. */
const descendantFolders = (folder: string) =>
  `WITH RECURSIVE descendants(Id) AS (SELECT ${folder} UNION ALL SELECT child.Id FROM Folder child ` +
  "JOIN descendants parent ON child.ParentFolderId = parent.Id " +
  "WHERE child.DeletedAtUtc IS NULL) SELECT Id FROM descendants";

const STABLE_ORDER = "p.SortOrder, tt_fold(t.Title), t.Id";

/**
 * Composes a validated search into one bounded, parameterized SQLite statement (§7.2).
 * Free text joins FTS hits through the stable mapping table, so deleted-row and scope
 * filters still apply. It reads `limit + 1` rows so the caller can report HasMore.
 */
export function buildSearchSql(
  query: ItemQuery,
  fields: ReadonlyArray<SearchableField>,
  limit: number,
): BuiltSearchSql {
  const parameters: Array<SQLInputValue> = [];
  const bind: BindParameter = (value) => {
    parameters.push(value);
    return "?";
  };
  const match = buildFtsTerms(query.text);
  const conditions = [
    ...visibilityConditions(query.includeCompleted),
    ...scopeConditions(query.scope, bind),
    ...(match === null ? [] : [`TodoItemSearch MATCH ${bind(match)}`]),
    ...filterConditions(query, fields, bind),
  ];
  const from = match === null ? SELECT_COLUMNS : SELECT_COLUMNS + FTS_JOIN;
  const order = match === null ? STABLE_ORDER : `bm25(TodoItemSearch), ${STABLE_ORDER}`;
  const where = conditions.join(" AND ");
  return {
    sql: `${from}WHERE ${where} ORDER BY ${order} LIMIT ${bind(limit + 1)}`,
    parameters,
  };
}

function visibilityConditions(includeCompleted: boolean): ReadonlyArray<string> {
  const active = ["t.DeletedAtUtc IS NULL", "p.DeletedAtUtc IS NULL", ACTIVE_FOLDER];
  return includeCompleted ? active : [...active, "t.CompletedAtUtc IS NULL"];
}

function scopeConditions(scope: SearchScope, bind: BindParameter): ReadonlyArray<string> {
  if (scope.kind === "allProjects") {
    return [];
  }
  const project = `t.ProjectId = ${bind(scope.projectId)}`;
  if (scope.kind === "project") {
    return [project];
  }
  if (scope.folderId === null) {
    return scope.includeSubfolders ? [project] : [project, "t.FolderId IS NULL"];
  }
  const folder = bind(scope.folderId);
  return scope.includeSubfolders
    ? [project, `t.FolderId IN (${descendantFolders(folder)})`]
    : [project, `t.FolderId = ${folder}`];
}

function filterConditions(
  query: ItemQuery,
  fields: ReadonlyArray<SearchableField>,
  bind: BindParameter,
): ReadonlyArray<string> {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  return query.filters.map((filter) => {
    const field = byKey.get(filter.fieldKey);
    if (field === undefined) {
      throw new Error(`Unknown search field '${filter.fieldKey}'.`);
    }
    return filterSql(field, filter, bind);
  });
}
