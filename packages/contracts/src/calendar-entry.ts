import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate, IsoFloatingDateTime, IsoTime } from "./iso-date-time.js";

/** Why an item appears on the calendar. */
export const CalendarEntryKind = Schema.Literals(["due", "scheduled"]);

/** Server-computed urgency for a calendar entry. */
export const CalendarUrgency = Schema.Literals(["None", "Approaching", "Imminent", "Overdue"]);

/** One due date or scheduled block projected for the renderer calendar. */
export const CalendarEntry = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  kind: CalendarEntryKind,
  date: IsoDate,
  startTime: Schema.NullOr(IsoTime),
  scheduledStart: Schema.NullOr(IsoFloatingDateTime),
  scheduledEnd: Schema.NullOr(IsoFloatingDateTime),
  isCompleted: Schema.Boolean,
  dueDate: Schema.NullOr(IsoDate),
  dueTime: Schema.NullOr(IsoTime),
  itemType: Schema.NullOr(Schema.String),
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
