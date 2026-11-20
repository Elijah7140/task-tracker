import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoUtcInstant } from "./iso-date-time.js";

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
  version: Schema.NullOr(Schema.String),
  estimatedHours: Schema.NullOr(Schema.Finite),
  percentComplete: Schema.NullOr(Schema.Int),
  isUrgent: Schema.Boolean,
  isSystemOutage: Schema.Boolean,
});

/** One entry of a ticket's comment log. */
export const TicketCommentProjection = Schema.Struct({
  id: Guid,
  itemId: Guid,
  body: Schema.String,
  createdAtUtc: IsoUtcInstant,
});

/** A ticket's fixed fields and its comments, newest first. */
export const TicketSnapshot = Schema.Struct({
  itemId: Guid,
  detail: TicketDetailInput,
  comments: Schema.Array(TicketCommentProjection),
});
