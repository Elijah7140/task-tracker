import { applyDdl } from "./apply-ddl.js";
import { ticketSchema } from "./add-tickets.js";

/**
 * The column definitions the owner removed on 23 Nov 2026 (§7.19), exactly as
 * `11_AddTickets` wrote them inside the `TicketDetail` DDL.
 */
const droppedColumnText = [
  `,
    Version TEXT NULL`,
  `,
    EstimatedHours REAL NULL
      CONSTRAINT CK_TicketDetail_EstimatedHours CHECK (EstimatedHours IS NULL OR EstimatedHours >= 0)`,
  `,
    PercentComplete INTEGER NULL
      CONSTRAINT CK_TicketDetail_PercentComplete CHECK (PercentComplete IS NULL OR PercentComplete BETWEEN 0 AND 100)`,
  `,
    IsUrgent INTEGER NOT NULL`,
  `,
    IsSystemOutage INTEGER NOT NULL`,
];

/** The columns that survive, which the rebuild copies across. */
const keptColumns = [
  "ItemId",
  "RequestorId",
  "ApplicationId",
  "ModuleId",
  "InterfaceId",
  "DispatchedToId",
  "PendingPersonId",
  "TicketTypeId",
].join(", ");

function withoutDroppedColumns(statement: string) {
  return droppedColumnText.reduce((text, column) => {
    if (!text.includes(column)) {
      throw new Error(`TicketDetail DDL no longer contains ${column.trim()}.`);
    }
    return text.replace(column, "");
  }, statement);
}

/** True for the `TicketDetail` table and index statements of `11_AddTickets`. */
const isTicketDetailStatement = (statement: string) =>
  statement.startsWith("CREATE TABLE TicketDetail") ||
  statement.startsWith("CREATE INDEX IX_TicketDetail_");

/** The `TicketDetail` table and index from stage 15 on. */
const slimTicketDetailSchema = ticketSchema
  .filter(isTicketDetailStatement)
  .map(withoutDroppedColumns);

/** The ticket schema as stored from stage 15 on. */
export const ticketSchemaWithoutExtras = ticketSchema.map((statement) =>
  isTicketDetailStatement(statement) ? withoutDroppedColumns(statement) : statement,
);

/**
 * Drops Version, Est. hours, % complete, Urgent and System outage with their values.
 * The table is rebuilt rather than altered so the stored DDL matches the stage schema
 * exactly: the old table moves aside, the new one takes its name, and the rows are
 * copied before the old table is dropped. Nothing references `TicketDetail`.
 */
export default applyDdl([
  "ALTER TABLE TicketDetail RENAME TO TicketDetail_Old",
  "DROP INDEX IX_TicketDetail_DispatchedToId",
  ...slimTicketDetailSchema,
  `INSERT INTO TicketDetail (${keptColumns}) SELECT ${keptColumns} FROM TicketDetail_Old`,
  "DROP TABLE TicketDetail_Old",
]);
