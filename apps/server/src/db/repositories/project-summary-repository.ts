import { Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { activeRow } from "../active-row.js";
import { DateText, Guid, TimeText } from "../storage-codecs.js";

const OpenCountRow = Schema.Struct({ projectId: Guid, openCount: Schema.Int });

const OpenDeadlineRow = Schema.Struct({
  projectId: Guid,
  dueDate: Schema.NullOr(DateText),
  dueTime: Schema.NullOr(TimeText),
});

/**
 * Reads what the home summaries count across every project in two queries, so
 * the cost does not grow with the item rows each project holds.
 */
export function projectSummaryRepository(sql: SqlClient.SqlClient) {
  const countOpen = SqlSchema.findAll({
    Request: Schema.Void,
    Result: OpenCountRow,
    execute: () => sql`SELECT ProjectId AS projectId, count(*) AS openCount FROM TodoItem
      WHERE CompletedAtUtc IS NULL AND ${activeRow(sql)} GROUP BY ProjectId`,
  });

  return {
    /** The number of active open items in each project that has any. */
    countOpen: () => countOpen(undefined),
    /**
     * The deadline fields of active open items whose due date is before
     * `bound`. Stored dates are ISO text, so text order follows date order.
     */
    listOpenDeadlinesBefore: SqlSchema.findAll({
      Request: DateText,
      Result: OpenDeadlineRow,
      execute: (bound) => sql`SELECT ProjectId AS projectId, DueDate AS dueDate,
          DueTime AS dueTime FROM TodoItem
        WHERE CompletedAtUtc IS NULL AND ${activeRow(sql)}
          AND DueDate < ${bound}`,
    }),
  };
}
