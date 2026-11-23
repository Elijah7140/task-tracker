import type { RankedTicket } from "@task-tracker/core";
import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { DateText, Guid, Real, TimeText, UtcTimestamp } from "../storage-codecs.js";

const TicketRow = Schema.Struct({
  id: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  ticketNumber: Schema.String,
  priorityLevelId: Schema.NullOr(Guid),
  ticketRank: Schema.NullOr(Real),
  statusId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(DateText),
  dueTime: Schema.NullOr(TimeText),
  createdAtUtc: UtcTimestamp,
});

/** An open, active item with a ticket number and what a Tickets row shows (§7.16). */
export type TicketRecord = RankedTicket & Omit<typeof TicketRow.Type, keyof RankedTicket>;

const RankRow = Schema.Struct({ id: Guid, rank: Real });

/**
 * Reads open tickets in active projects and folders and writes ticket ranks on
 * the caller's transaction. Deleting a folder or item deletes its descendants,
 * so an active item's own folder decides whether the item is active.
 */
export function ticketRepository(sql: SqlClient.SqlClient) {
  const list = SqlSchema.findAll({
    Request: Schema.NullOr(Guid),
    Result: TicketRow,
    execute: (projectId) => sql`SELECT i.Id AS id, i.ProjectId AS projectId,
        i.FolderId AS folderId, i.Title AS title, i.TicketNumber AS ticketNumber,
        i.PriorityLevelId AS priorityLevelId, i.TicketRank AS ticketRank,
        i.StatusId AS statusId, i.DueDate AS dueDate, i.DueTime AS dueTime,
        i.CreatedAtUtc AS createdAtUtc
      FROM TodoItem AS i
      JOIN Project AS p ON p.Id = i.ProjectId AND ${activeRow(sql, "p")}
      LEFT JOIN Folder AS f ON f.Id = i.FolderId
      WHERE i.TicketNumber IS NOT NULL AND i.CompletedAtUtc IS NULL AND ${activeRow(sql, "i")}
        AND (i.FolderId IS NULL OR ${activeRow(sql, "f")})
        ${projectId === null ? sql`` : sql`AND i.ProjectId = ${projectId}`}`,
  });

  return {
    /** Open tickets in one project, or in every project when `projectId` is null. */
    listOpen: (projectId: string | null): ReturnType<typeof list> => list(projectId),
    /** Stores a rank without touching the modification time, as legacy ranks did. */
    setRank: SqlSchema.void({
      Request: RankRow,
      execute: ({ id, rank }) => sql`UPDATE TodoItem SET TicketRank = ${rank} WHERE Id = ${id}`,
    }),
  };
}
