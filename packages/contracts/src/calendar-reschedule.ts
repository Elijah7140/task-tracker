import { Schema } from "effect";
import { CalendarItemLocation } from "./calendar-entry.js";
import { Guid } from "./guid.js";
import { IsoDate } from "./iso-date-time.js";

const target = Schema.Union([
  Schema.Struct({ type: Schema.Literal("month"), date: IsoDate }),
  Schema.Struct({ type: Schema.Literal("all-day"), date: IsoDate }),
  Schema.Struct({
    type: Schema.Literal("time"),
    date: IsoDate,
    minute: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1425 })),
  }),
  Schema.Struct({ type: Schema.Literal("step"), days: Schema.Int, quarters: Schema.Int }),
]);

/** An absolute drop or relative Alt+arrow move, applied to the item's current due date. */
export const CalendarReschedule = Schema.Struct({
  itemId: Guid,
  target,
});

/** The moved entry's destination and current workspace location, or null for a no-op. */
export const CalendarRescheduleResult = Schema.NullOr(
  CalendarItemLocation.mapFields((fields) => ({ ...fields, date: IsoDate })),
);
