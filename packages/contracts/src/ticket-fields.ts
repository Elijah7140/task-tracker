import { Schema } from "effect";
import { Guid } from "./guid.js";

/** ToDo or Ticket (§7.19). */
export const ItemKind = Schema.Literals(["Todo", "Ticket"]);

/** The ticket lists in App Settings: People, Ticket types and the three ticket levels. */
export const TicketListKind = Schema.Literals([
  "Person",
  "TicketType",
  "Application",
  "Module",
  "Interface",
]);

/** One ticket list entry. Modules name their Application and Interfaces their Module. */
export const TicketListEntryProjection = Schema.Struct({
  id: Guid,
  listKind: TicketListKind,
  parentId: Schema.NullOr(Guid),
  name: Schema.String,
  isArchived: Schema.Boolean,
  sortOrder: Schema.Int,
});

const optionalEntry = Schema.NullOr(Guid);

/** The fixed ticket fields without a shared item column, as a save sends them. */
export const TicketDetailInput = Schema.Struct({
  requestorId: optionalEntry,
  applicationId: optionalEntry,
  moduleId: optionalEntry,
  interfaceId: optionalEntry,
  dispatchedToId: optionalEntry,
  pendingPersonId: optionalEntry,
  ticketTypeId: optionalEntry,
  /** The parent ticket's number as free text; Task Tracker may not hold that ticket. */
  parentTicketNumber: Schema.NullOr(Schema.String),
});

/** A ticket's fixed fields. */
export const TicketSnapshot = Schema.Struct({
  itemId: Guid,
  detail: TicketDetailInput,
});

/** Where a ticket found by its number lives, for opening its drill-in view (§7.19). */
export const TicketLocation = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
});
