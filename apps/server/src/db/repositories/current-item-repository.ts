import { Effect, Option, Schema } from "effect";
import { type SqlClient, SqlSchema } from "effect/sql";
import { Bit, DateText, Guid, TimeText } from "../storage-codecs.js";

const CurrentItemRow = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  areaPath: Schema.String,
  statusName: Schema.NullOr(Schema.String),
  priorityName: Schema.NullOr(Schema.String),
  dueDate: Schema.NullOr(DateText),
  dueTime: Schema.NullOr(TimeText),
  isCompleted: Bit,
  description: Schema.NullOr(Schema.String),
});

/** What the tray card shows about the current item, with dates as ISO text (§7.18). */
export interface CurrentItemCardRow {
  readonly itemId: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly title: string;
  readonly areaPath: string;
  readonly statusName: string | null;
  readonly priorityName: string | null;
  readonly dueDate: string | null;
  readonly dueTime: string | null;
  readonly isCompleted: boolean;
  readonly description: string | null;
}

/**
 * Finds an item that is neither deleted nor inside a deleted project, with its
 * lookup names and the project and active folder names that hold it, joined by
 * " › " outermost first, as the legacy card built them.
 */
const cardQuery = (sql: SqlClient.SqlClient, itemId: string) => sql`
  WITH RECURSIVE chain(Id, ParentFolderId, Name, Depth) AS (
    SELECT f.Id, f.ParentFolderId, f.Name, 0 FROM Folder f
    WHERE f.Id = (SELECT FolderId FROM TodoItem WHERE Id = ${itemId}) AND f.DeletedAtUtc IS NULL
    UNION ALL
    SELECT f.Id, f.ParentFolderId, f.Name, chain.Depth + 1
    FROM chain JOIN Folder f ON f.Id = chain.ParentFolderId
    WHERE f.DeletedAtUtc IS NULL
  )
  SELECT i.Id AS itemId, p.Id AS projectId, i.FolderId AS folderId, i.Title AS title,
    p.Name || coalesce((SELECT group_concat(' › ' || Name, '')
      FROM (SELECT Name FROM chain ORDER BY Depth DESC)), '') AS areaPath,
    s.Name AS statusName, l.Name AS priorityName, i.DueDate AS dueDate, i.DueTime AS dueTime,
    i.CompletedAtUtc IS NOT NULL AS isCompleted, i.Description AS description
  FROM TodoItem i
  JOIN Project p ON p.Id = i.ProjectId AND p.DeletedAtUtc IS NULL
  LEFT JOIN StatusLevel s ON s.Id = i.StatusId
  LEFT JOIN PriorityLevel l ON l.Id = i.PriorityLevelId
  WHERE i.Id = ${itemId} AND i.DeletedAtUtc IS NULL`;

/** Reads the current item's card on the caller's transaction. */
export function currentItemRepository(sql: SqlClient.SqlClient) {
  const find = SqlSchema.findOneOption({
    Request: Guid,
    Result: CurrentItemRow,
    execute: (itemId) => cardQuery(sql, itemId),
  });
  return {
    /** The card of an available item, or none when it is missing or deleted. */
    findAvailable: (itemId: string) =>
      find(itemId).pipe(
        Effect.map(
          Option.map((row): CurrentItemCardRow => ({
            ...row,
            dueDate: row.dueDate?.toString() ?? null,
            dueTime: row.dueTime?.toString() ?? null,
          })),
        ),
      ),
  };
}
