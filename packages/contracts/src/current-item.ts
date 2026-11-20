import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate, IsoTime } from "./iso-date-time.js";

/**
 * What the tray card shows about the current item (§7.18). The area path joins
 * the project and folder names with " › ". The project and folder identify the
 * area for completion and for opening the item in the main window.
 */
export const CurrentItemCard = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  areaPath: Schema.String,
  statusName: Schema.NullOr(Schema.String),
  priorityName: Schema.NullOr(Schema.String),
  dueDate: Schema.NullOr(IsoDate),
  dueTime: Schema.NullOr(IsoTime),
  isCompleted: Schema.Boolean,
  description: Schema.NullOr(Schema.String),
});
