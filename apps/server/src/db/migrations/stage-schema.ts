import { customFieldSchema } from "./add-custom-fields.js";
import { inProgressStatusColumns } from "./add-in-progress-statuses.js";
import { itemLinkSchema } from "./add-item-links.js";
import { itemSearchSchema, searchShadowSchema } from "./add-item-search.js";
import { recurrenceColumns } from "./add-recurrence.js";
import { reminderColumns } from "./add-reminders.js";
import { savedSearchSchema } from "./add-saved-searches.js";
import {
  itemStatusSchema,
  priorityNumberColumns,
  statusColumns,
  statusLookupSchema,
} from "./add-statuses-and-priority-numbers.js";
import { ticketRankColumns } from "./add-ticket-rank.js";
import { itemKindColumns, projectIconColumns, ticketSchema } from "./add-tickets.js";
import { withoutSchedule } from "./drop-item-schedule.js";
import { ticketSchemaWithoutExtras } from "./drop-ticket-extra-fields.js";
import { todayCompletionsSchema } from "./index-today-completions.js";
import { initialSchema } from "./initial-create.js";

function extendTable(statement: string, before: string, columns: readonly string[]) {
  if (columns.length === 0) {
    return statement;
  }
  // SQLite splices ADD COLUMN definitions before table constraints or the closing parenthesis.
  return statement.replace(before, `, ${columns.join(", ")}${before}`);
}

function extendInitialSchema(stage: number) {
  const itemColumns = [
    ...(stage >= 6 ? recurrenceColumns : []),
    ...(stage >= 7 ? reminderColumns : []),
    ...(stage >= 9 ? statusColumns : []),
    ...(stage >= 10 ? ticketRankColumns : []),
    ...(stage >= 11 ? itemKindColumns : []),
  ];
  return initialSchema
    .filter(
      (statement) =>
        stage < 9 || !statement.startsWith('CREATE UNIQUE INDEX "IX_PriorityLevel_Name"'),
    )
    .map((statement) => {
      if (statement.startsWith('CREATE TABLE "TodoItem"')) {
        const table = extendTable(
          statement,
          ',\n    CONSTRAINT "CK_TodoItem_DueTime"',
          itemColumns,
        );
        return stage >= 14 ? withoutSchedule(table) : table;
      }
      if (stage >= 11 && statement.startsWith('CREATE TABLE "Project"')) {
        return extendTable(statement, ")", projectIconColumns);
      }
      if (stage >= 9 && statement.startsWith('CREATE TABLE "PriorityLevel"')) {
        return extendTable(statement, ")", priorityNumberColumns);
      }
      return statement;
    });
}

/** Appends columns as SQLite stores them after ALTER TABLE: after a line break, before ")". */
function appendColumns(statement: string, columns: readonly string[]) {
  return `${statement.slice(0, -1)}, ${columns.join(", ")})`;
}

/** The status table, with the In progress mark from stage 13. */
function statusSchema(stage: number) {
  return statusLookupSchema.map((statement) =>
    stage >= 13 && statement.startsWith("CREATE TABLE StatusLevel")
      ? appendColumns(statement, inProgressStatusColumns)
      : statement,
  );
}

/** Returns the stored application schema expected at a validated migration prefix. */
export function stageSchema(stage: number) {
  return [
    ...(stage >= 1 ? extendInitialSchema(stage) : []),
    ...(stage >= 2 ? customFieldSchema : []),
    ...(stage >= 3 ? [...itemSearchSchema, ...searchShadowSchema] : []),
    ...(stage >= 4 ? savedSearchSchema : []),
    ...(stage >= 5 ? itemLinkSchema : []),
    ...(stage >= 8 ? todayCompletionsSchema : []),
    ...(stage >= 9 ? [...statusSchema(stage), ...itemStatusSchema] : []),
    ...(stage >= 11 ? (stage >= 15 ? ticketSchemaWithoutExtras : ticketSchema) : []),
  ];
}
