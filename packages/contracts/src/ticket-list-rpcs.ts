import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import { TicketListEntryProjection, TicketListKind } from "./ticket-fields.js";

/** Manage People, Ticket types and the ticket levels tree (§7.19). Lists include archived rows. */
export const TicketListRpcs = RpcGroup.make(
  Rpc.make("ListTicketListEntries", {
    success: Schema.Array(TicketListEntryProjection),
    error: RpcOperationError,
  }),
  Rpc.make("AddTicketListEntry", {
    payload: { listKind: TicketListKind, parentId: Schema.NullOr(Guid), name: Schema.String },
    success: TicketListEntryProjection,
    error: RpcOperationError,
  }),
  Rpc.make("RenameTicketListEntry", {
    payload: { id: Guid, name: Schema.String },
    error: RpcOperationError,
  }),
  Rpc.make("ArchiveTicketListEntry", { payload: { id: Guid }, error: RpcOperationError }),
  Rpc.make("RestoreTicketListEntry", { payload: { id: Guid }, error: RpcOperationError }),
  Rpc.make("ReorderTicketListEntries", {
    payload: { listKind: TicketListKind, parentId: Schema.NullOr(Guid), ids: Schema.Array(Guid) },
    error: RpcOperationError,
  }),
);
