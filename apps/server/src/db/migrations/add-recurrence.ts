import { Effect } from "effect";
import { addColumns } from "./apply-ddl.js";
import { reserveSearchKey } from "./reserve-search-key.js";

/** Additive TodoItem columns for recurrence. */
export const recurrenceColumns = [
  '"RecurrenceAnchor" INTEGER NULL',
  '"RecurrenceEndDate" TEXT NULL',
  '"RecurrenceEndKind" INTEGER NULL',
  '"RecurrenceFrequency" INTEGER NULL',
  '"RecurrenceInterval" INTEGER NULL',
  '"RecurrenceMonth" INTEGER NULL',
  '"RecurrenceMonthDay" INTEGER NULL',
  '"RecurrenceRemaining" INTEGER NULL',
  '"RecurrenceSeriesId" TEXT NULL',
  '"RecurrenceSuccessorCreated" INTEGER NOT NULL DEFAULT 0',
  '"RecurrenceWeekdays" INTEGER NULL',
];

/** Adds recurrence storage while preserving the item search mapping and triggers. */
export default Effect.gen(function* () {
  yield* reserveSearchKey("repeats", true);
  yield* addColumns("TodoItem", recurrenceColumns);
});
