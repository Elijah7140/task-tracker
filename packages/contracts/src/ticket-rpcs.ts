import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import { TicketBoard, TicketPosition } from "./ticket-board.js";

/**
 * The Tickets view (§7.16). Listing never writes ranks. A move or priority
 * change returns false when it left everything as it was, and otherwise
 * records one undo step.
 */
export const TicketRpcs = RpcGroup.make(
  Rpc.make("LoadTickets", {
    payload: { projectId: Schema.NullOr(Guid) },
    success: TicketBoard,
    error: RpcOperationError,
  }),
  Rpc.make("MoveTicket", {
    payload: { itemId: Guid, position: TicketPosition },
    success: Schema.Boolean,
    error: RpcOperationError,
  }),
  /** Sets the priority and appends the ticket after every ticket in the new section. */
  Rpc.make("SetTicketPriority", {
    payload: { itemId: Guid, priorityLevelId: Schema.NullOr(Guid) },
    success: Schema.Boolean,
    error: RpcOperationError,
  }),
);
