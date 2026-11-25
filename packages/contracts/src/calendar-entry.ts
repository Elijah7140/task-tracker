import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate, IsoTime } from "./iso-date-time.js";

/** Server-computed urgency for a calendar entry. */
export const CalendarUrgency = Schema.Literals(["None", "Approaching", "Imminent", "Overdue"]);

/** One item's due date projected for the renderer calendar. */
export const CalendarEntry = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  date: IsoDate,
  startTime: Schema.NullOr(IsoTime),
  isCompleted: Schema.Boolean,
  dueDate: Schema.NullOr(IsoDate),
  dueTime: Schema.NullOr(IsoTime),
  priority: Schema.NullOr(Schema.String),
  statusId: Schema.NullOr(Guid),
  statusName: Schema.NullOr(Schema.String),
  priorityLevelId: Schema.NullOr(Guid),
  urgency: CalendarUrgency,
});

/** Calendar entries in a date range with the server's current local date. */
export const CalendarSnapshot = Schema.Struct({
  today: IsoDate,
  entries: Schema.Array(CalendarEntry),
});

/** Current active workspace location of an item opened from the calendar. */
export const CalendarItemLocation = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
});
