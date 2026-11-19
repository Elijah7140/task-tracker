import type { LocalDayWindow } from "@task-tracker/core";
import { Schema } from "effect";
import { type SqlClient, SqlSchema } from "effect/sql";
import { Bit, Guid, UtcTimestamp } from "../storage-codecs.js";

const TodayItemRow = Schema.Struct({
  id: Guid,
  projectId: Guid,
  projectName: Schema.String,
  projectOrder: Schema.Int,
  folderId: Schema.NullOr(Guid),
  areaPath: Schema.String,
  parentItemId: Schema.NullOr(Guid),
  title: Schema.String,
  sortOrder: Schema.Int,
  isCompleted: Bit,
  completedToday: Bit,
  hasDates: Bit,
  statusId: Schema.NullOr(Guid),
  statusName: Schema.NullOr(Schema.String),
  priorityLevelId: Schema.NullOr(Guid),
});

/** Stored UTC text bounds of a day, compared as text like the column's partial index. */
export const DayBounds = Schema.Struct({ startUtc: UtcTimestamp, endUtc: UtcTimestamp });

/**
 * Today's completions use the partial completion index, then gather their
 * active item ancestors and each folder's breadcrumb. A folder chain that
 * reaches a deleted folder never reaches the top, so its items drop out.
 * Exported so tests can inspect its query plan.
 */
export const todayQuery = (sql: SqlClient.SqlClient, bounds: typeof DayBounds.Encoded) => sql`
  WITH RECURSIVE
  done(Id) AS (
    SELECT Id FROM TodoItem
    WHERE CompletedAtUtc IS NOT NULL AND DeletedAtUtc IS NULL
      AND CompletedAtUtc >= ${bounds.startUtc} AND CompletedAtUtc < ${bounds.endUtc}
  ),
  branch(Id, ParentItemId) AS (
    SELECT i.Id, i.ParentItemId FROM done JOIN TodoItem i ON i.Id = done.Id
    UNION
    SELECT p.Id, p.ParentItemId FROM branch JOIN TodoItem p ON p.Id = branch.ParentItemId
    WHERE p.DeletedAtUtc IS NULL
  ),
  paths(Id, ParentFolderId, Path) AS (
    SELECT f.Id, f.ParentFolderId, f.Name FROM Folder f
    WHERE f.DeletedAtUtc IS NULL
      AND f.Id IN (SELECT i.FolderId FROM branch JOIN TodoItem i ON i.Id = branch.Id)
    UNION ALL
    SELECT paths.Id, f.ParentFolderId, f.Name || ' › ' || paths.Path
    FROM paths JOIN Folder f ON f.Id = paths.ParentFolderId
    WHERE f.DeletedAtUtc IS NULL
  )
  SELECT i.Id AS id, p.Id AS projectId, p.Name AS projectName, p.SortOrder AS projectOrder,
    i.FolderId AS folderId, p.Name || coalesce(' › ' || paths.Path, '') AS areaPath,
    i.ParentItemId AS parentItemId, i.Title AS title, i.SortOrder AS sortOrder,
    i.CompletedAtUtc IS NOT NULL AS isCompleted,
    done.Id IS NOT NULL AS completedToday,
    (i.DueDate IS NOT NULL OR i.ScheduledStart IS NOT NULL) AS hasDates,
    i.StatusId AS statusId, s.Name AS statusName, i.PriorityLevelId AS priorityLevelId
  FROM branch JOIN TodoItem i ON i.Id = branch.Id
  JOIN Project p ON p.Id = i.ProjectId AND p.DeletedAtUtc IS NULL
  LEFT JOIN paths ON paths.Id = i.FolderId AND paths.ParentFolderId IS NULL
  LEFT JOIN done ON done.Id = i.Id
  LEFT JOIN StatusLevel s ON s.Id = i.StatusId
  WHERE i.FolderId IS NULL OR paths.Id IS NOT NULL`;

/** Reads the completions of one local day and the ancestors that give them context (§7.14). */
export function todayRepository(sql: SqlClient.SqlClient) {
  const selectDay = SqlSchema.findAll({
    Request: DayBounds,
    Result: TodayItemRow,
    execute: (bounds) => todayQuery(sql, bounds),
  });

  return {
    load: (window: LocalDayWindow) =>
      selectDay({ startUtc: window.startUtc, endUtc: window.endUtc }),
  };
}
