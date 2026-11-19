import { EntityMissing, type TodoItem } from "@task-tracker/core";
import { Effect, Option, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { Guid, UtcTimestamp } from "../storage-codecs.js";
import {
  ItemDatesRow,
  ItemEditRow,
  ItemPriorityRow,
  ItemRecurrenceRow,
  ItemRow,
  itemRowColumns,
  ItemStructureRow,
} from "./item-row.js";
import { writeRecurrence } from "./recurrence-columns.js";

const area = Schema.Struct({ projectId: Guid, folderId: Schema.NullOr(Guid) });

/** Persist item edits and structure alongside completion changes in the caller's transaction. */
export function itemRepository(sql: SqlClient.SqlClient) {
  const findActive = SqlSchema.findOneOption({
    Request: Guid,
    Result: ItemRow,
    execute: (id) =>
      sql`SELECT ${itemRowColumns} FROM TodoItem WHERE Id = ${id} AND ${activeRow(sql)}`,
  });
  const listArea = (includeDeleted: boolean) =>
    SqlSchema.findAll({
      Request: area,
      Result: ItemRow,
      execute: ({ projectId, folderId }) => sql`SELECT ${itemRowColumns} FROM TodoItem
        WHERE ProjectId = ${projectId} AND FolderId IS ${folderId}
        ${includeDeleted ? sql` ` : sql`AND ${activeRow(sql)}`} ORDER BY rowid`,
    });

  const writeRecurrenceRow = SqlSchema.void({
    Request: ItemRecurrenceRow,
    execute: ({ Id, ...values }) =>
      sql`UPDATE TodoItem SET ${sql.update(values)} WHERE Id = ${Id} AND ${activeRow(sql)}`,
  });

  return {
    loadActiveArea: listArea(false),
    // Deleted rows still carry their batch and follow the branch on cross-area moves.
    loadAreaIncludingDeleted: listArea(true),
    requireActive: (id: string) =>
      findActive(id).pipe(
        Effect.flatMap(
          Option.match({
            onSome: Effect.succeed,
            onNone: () => Effect.fail(new EntityMissing("Item")),
          }),
        ),
      ),
    insert: SqlSchema.void({
      Request: ItemRow,
      execute: (values) => sql`INSERT INTO TodoItem ${sql.insert(values)}`,
    }),
    updateStructure: SqlSchema.void({
      Request: ItemStructureRow,
      execute: ({ Id, ProjectId, ...values }) => sql`UPDATE TodoItem SET ${sql.update(values)}
        WHERE Id = ${Id} AND ProjectId = ${ProjectId}`,
    }),
    updatePriority: SqlSchema.void({
      Request: ItemPriorityRow,
      execute: ({ Id, ...values }) =>
        sql`UPDATE TodoItem SET ${sql.update(values)}, TicketRank = NULL
          WHERE Id = ${Id} AND ${activeRow(sql)}`,
    }),
    setStatus: SqlSchema.void({
      Request: Schema.Struct({ id: Guid, statusId: Schema.NullOr(Guid), now: UtcTimestamp }),
      execute: ({ id, statusId, now }) =>
        sql`UPDATE TodoItem SET StatusId = ${statusId}, UpdatedAtUtc = ${now}
          WHERE Id = ${id} AND ${activeRow(sql)}`,
    }),
    updateDates: SqlSchema.void({
      Request: ItemDatesRow,
      execute: ({ Id, ...values }) =>
        sql`UPDATE TodoItem SET ${sql.update(values)} WHERE Id = ${Id} AND ${activeRow(sql)}`,
    }),
    /** Writes the item's rule, series and successor marker with its modification time. */
    saveRecurrence: (item: TodoItem) =>
      writeRecurrenceRow({
        id: item.id,
        updatedAtUtc: item.updatedAtUtc,
        ...writeRecurrence(item),
      }),
    /** Remembers that completing this occurrence created its successor (§7.11). */
    markSuccessorCreated: SqlSchema.void({
      Request: Schema.Struct({ id: Guid, now: UtcTimestamp }),
      execute: ({ id, now }) => sql`UPDATE TodoItem SET RecurrenceSuccessorCreated = 1,
        UpdatedAtUtc = ${now} WHERE Id = ${id} AND ${activeRow(sql)}`,
    }),
    /** Copies the reminder choice, without delivery or snooze state, to a next occurrence. */
    copyReminder: SqlSchema.void({
      Request: Schema.Struct({ sourceId: Guid, copyId: Guid }),
      execute: ({ sourceId, copyId }) => sql`UPDATE TodoItem SET
        ReminderMode = (SELECT ReminderMode FROM TodoItem WHERE Id = ${sourceId}),
        ReminderOffsetMinutes = (SELECT ReminderOffsetMinutes FROM TodoItem WHERE Id = ${sourceId})
        WHERE Id = ${copyId}`,
    }),
    updateEdit: SqlSchema.void({
      Request: ItemEditRow,
      // SET expressions read the previous row, so a changed priority or a removed ticket
      // number clears the ticket order in the same write, as legacy TodoItem did.
      execute: ({ Id, ...values }) =>
        sql`UPDATE TodoItem SET ${sql.update(values)},
          TicketRank = CASE
            WHEN PriorityLevelId IS NOT ${values.PriorityLevelId} OR ${values.TicketNumber} IS NULL
            THEN NULL ELSE TicketRank END
          WHERE Id = ${Id} AND ${activeRow(sql)}`,
    }),
  };
}
