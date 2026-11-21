import { Schema } from "effect";
import { ItemEdit } from "./item.js";
import { NotFound, OperationFailed, RuleViolation } from "./rpc-operation-error.js";
import { TicketDetailInput } from "./ticket-fields.js";

/** One ticket in the tray's multi-ticket add view (§7.20). */
export const NewTicketInput = Schema.Struct({
  fields: ItemEdit,
  /** The fixed ticket fields; omitted when none were filled in. */
  ticket: Schema.optionalKey(TicketDetailInput),
});

/**
 * A rule refused one ticket of a batch, so the batch saved nothing. `index` is the
 * ticket's position in the request, which lets the view mark the ticket to fix.
 */
export class TicketRejected extends Schema.TaggedError<TicketRejected>()("TicketRejected", {
  index: Schema.Int,
  message: Schema.String,
}) {}

/** Failures of `AddTickets`: the usual operation errors, or one rejected ticket. */
export const AddTicketsError = Schema.Union([
  RuleViolation,
  NotFound,
  OperationFailed,
  TicketRejected,
]);
