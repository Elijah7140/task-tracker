import { TicketListRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { TicketListService } from "../services/ticket-list-service.js";
import { mapOperationError } from "./map-operation-error.js";
import { projectTicketListEntry } from "./ticket-projection.js";

/** Bind the ticket list RPCs to the transactional list service (§7.19). */
export const ticketListRpcHandlers = TicketListRpcs.toLayer(
  Effect.gen(function* () {
    const lists = yield* TicketListService;
    return TicketListRpcs.of({
      ListTicketListEntries: () =>
        lists.list().pipe(
          Effect.map((rows) => rows.map(projectTicketListEntry)),
          mapOperationError,
        ),
      AddTicketListEntry: ({ listKind, parentId, name }) =>
        lists
          .add(listKind, parentId, name)
          .pipe(Effect.map(projectTicketListEntry), mapOperationError),
      RenameTicketListEntry: ({ id, name }) => lists.rename(id, name).pipe(mapOperationError),
      ArchiveTicketListEntry: ({ id }) => lists.archive(id).pipe(mapOperationError),
      RestoreTicketListEntry: ({ id }) => lists.restore(id).pipe(mapOperationError),
      ReorderTicketListEntries: ({ listKind, parentId, ids }) =>
        lists.reorder(listKind, parentId, ids).pipe(mapOperationError),
    });
  }),
).pipe(Layer.provide(TicketListService.layer));
