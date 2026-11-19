import { Schema } from "effect";
import { IsoDate } from "./iso-date-time.js";

/**
 * A repeat rule on the wire (§7.11). `weekdays` holds Monday-first bit flags
 * (Monday = 1 … Sunday = 64), `monthDay` 0 means the last day of the month and
 * `remaining` counts the current occurrence. The server validates the combination.
 */
export const RecurrenceRule = Schema.Struct({
  frequency: Schema.Literals(["Daily", "Weekly", "Monthly", "Yearly"]),
  interval: Schema.Int,
  weekdays: Schema.NullOr(Schema.Int),
  monthDay: Schema.NullOr(Schema.Int),
  month: Schema.NullOr(Schema.Int),
  anchor: Schema.Literals(["DueDate", "CompletionDate"]),
  endKind: Schema.Literals(["Never", "OnDate", "AfterCount"]),
  endDate: Schema.NullOr(IsoDate),
  remaining: Schema.NullOr(Schema.Int),
});
