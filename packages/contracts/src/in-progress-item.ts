import { Schema } from "effect";
import { CalendarUrgency } from "./calendar-entry.js";
import { Guid } from "./guid.js";
import { IsoDate, IsoTime } from "./iso-date-time.js";
import { ItemKind } from "./ticket-fields.js";

/**
 * One row of the tray card's in-progress stack (§7.18): an open item whose
 * status is marked In progress. The area path joins the project and folder
 * names with " › ". The project and folder identify the area for completion
 * and for opening the item in the main window. The urgency is the item's own,
 * from its project's thresholds.
 */
export const InProgressItem = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  itemKind: ItemKind,
  ticketNumber: Schema.NullOr(Schema.String),
  title: Schema.String,
  areaPath: Schema.String,
  statusName: Schema.String,
  priorityName: Schema.NullOr(Schema.String),
  dueDate: Schema.NullOr(IsoDate),
  dueTime: Schema.NullOr(IsoTime),
  urgency: CalendarUrgency,
});
