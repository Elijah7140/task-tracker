import { Schema } from "effect";
import { type SqlClient, SqlSchema } from "effect/sql";
import { DateText, Guid, TimeText } from "../storage-codecs.js";

/** An open item whose status is marked In progress, with what the tray card shows (§7.18). */
export const InProgressItemRow = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  itemKind: Schema.Literals(["Todo", "Ticket"]),
  ticketNumber: Schema.NullOr(Schema.String),
  title: Schema.String,
  areaPath: Schema.String,
  statusName: Schema.String,
  priorityName: Schema.NullOr(Schema.String),
  priorityNumber: Schema.NullOr(Schema.Int),
  priorityRank: Schema.NullOr(Schema.Int),
  dueDate: Schema.NullOr(DateText),
  dueTime: Schema.NullOr(TimeText),
});

/**
 * Open items that are neither deleted nor in a deleted project or folder and
 * whose status is marked In progress, each with its lookup names and the
 * project and folder names that hold it, joined by " › " outermost first. A
 * folder chain that reaches a deleted folder never reaches the top, so its
 * items drop out. Exported so tests can inspect its query plan.
 */
export const inProgressQuery = (sql: SqlClient.SqlClient) => sql`
  WITH RECURSIVE
  active(Id) AS (
    SELECT i.Id FROM TodoItem i JOIN StatusLevel s ON s.Id = i.StatusId AND s.IsInProgress = 1
    WHERE i.CompletedAtUtc IS NULL AND i.DeletedAtUtc IS NULL
  ),
  paths(Id, ParentFolderId, Path) AS (
    SELECT f.Id, f.ParentFolderId, f.Name FROM Folder f
    WHERE f.DeletedAtUtc IS NULL
      AND f.Id IN (SELECT i.FolderId FROM active JOIN TodoItem i ON i.Id = active.Id)
    UNION ALL
    SELECT paths.Id, f.ParentFolderId, f.Name || ' › ' || paths.Path
    FROM paths JOIN Folder f ON f.Id = paths.ParentFolderId
    WHERE f.DeletedAtUtc IS NULL
  )
  SELECT i.Id AS itemId, p.Id AS projectId, i.FolderId AS folderId, i.ItemKind AS itemKind,
    i.TicketNumber AS ticketNumber, i.Title AS title,
    p.Name || coalesce(' › ' || paths.Path, '') AS areaPath, s.Name AS statusName,
    l.Name AS priorityName, l.Number AS priorityNumber, l.SortOrder AS priorityRank,
    i.DueDate AS dueDate, i.DueTime AS dueTime
  FROM active JOIN TodoItem i ON i.Id = active.Id
  JOIN Project p ON p.Id = i.ProjectId AND p.DeletedAtUtc IS NULL
  JOIN StatusLevel s ON s.Id = i.StatusId
  LEFT JOIN PriorityLevel l ON l.Id = i.PriorityLevelId
  LEFT JOIN paths ON paths.Id = i.FolderId AND paths.ParentFolderId IS NULL
  WHERE i.FolderId IS NULL OR paths.Id IS NOT NULL`;

/** Reads the tray card's in-progress items on the caller's transaction (§7.18). */
export function inProgressRepository(sql: SqlClient.SqlClient) {
  const list = SqlSchema.findAll({
    Request: Schema.Void,
    Result: InProgressItemRow,
    execute: () => inProgressQuery(sql),
  });
  return {
    /** Every in-progress item, in no particular order. */
    list: () => list(undefined),
  };
}
