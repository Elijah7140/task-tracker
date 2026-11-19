import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate, IsoTime } from "./iso-date-time.js";

/** One open item with a ticket number, as a Tickets row shows it (§7.16). */
export const TicketRow = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  projectName: Schema.String,
  ticketNumber: Schema.String,
  title: Schema.String,
  statusId: Schema.NullOr(Guid),
  statusName: Schema.NullOr(Schema.String),
  priorityLevelId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(IsoDate),
  dueTime: Schema.NullOr(IsoTime),
  /** Whether the item has a scheduled block, which Push back one day also moves (§7.14). */
  hasSchedule: Schema.Boolean,
});

/**
 * A Tickets section in display order. A null priority is No priority. An
 * archived level is listed only while it holds tickets and accepts no new ones.
 */
export const TicketSection = Schema.Struct({
  priorityLevelId: Schema.NullOr(Guid),
  label: Schema.String,
  isArchived: Schema.Boolean,
  tickets: Schema.Array(TicketRow),
});

/** A project the Tickets filter offers. */
export const TicketProject = Schema.Struct({ id: Guid, name: Schema.String });

/** The ordered Tickets sections for the filter, with the active projects it offers. */
export const TicketBoard = Schema.Struct({
  sections: Schema.Array(TicketSection),
  projects: Schema.Array(TicketProject),
});

/**
 * Before or after `anchorId` in the destination section, or at its start when
 * the anchor is null. The anchor is found among tickets in every project.
 */
export const TicketPosition = Schema.Struct({
  priorityLevelId: Schema.NullOr(Guid),
  anchorId: Schema.NullOr(Guid),
  after: Schema.Boolean,
});
