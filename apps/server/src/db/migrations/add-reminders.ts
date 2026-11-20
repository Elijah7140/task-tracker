import { Effect } from "effect";
import { addColumns } from "./apply-ddl.js";
import { reserveSearchKey } from "./reserve-search-key.js";

/** Additive TodoItem columns for reminder. */
export const reminderColumns = [
  '"ReminderDeliveredFor" INTEGER NULL',
  '"ReminderMode" INTEGER NULL',
  '"ReminderOffsetMinutes" INTEGER NULL',
  '"SnoozedForUtc" INTEGER NULL',
  '"SnoozedUntilUtc" INTEGER NULL',
];

/** Adds reminder storage while preserving the item search mapping and triggers. */
export default Effect.gen(function* () {
  yield* reserveSearchKey("reminder", true);
  yield* addColumns("TodoItem", reminderColumns);
});
