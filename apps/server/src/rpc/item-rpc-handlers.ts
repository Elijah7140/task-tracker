import { ItemRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { ItemService } from "../services/item-service.js";
import {
  parseItemEdit,
  parseRecurrence,
  projectArea,
  projectCompletion,
  projectItem,
} from "./item-projection.js";
import { parseFieldValueInput, projectItemFieldValue } from "./field-value-projection.js";
import { projectItemLink } from "./item-link-projection.js";
import { projectTicket, projectTicketComment } from "./ticket-projection.js";

import { mapOperationError } from "./map-operation-error.js";
import { mapAddTicketsError } from "./map-add-tickets-error.js";

/** Delegate item calls to the service with the same clock, time zone and database as the server. */
export const itemRpcHandlers = (timeZone: string) =>
  ItemRpcs.toLayer(
    Effect.gen(function* () {
      const items = yield* ItemService;
      return ItemRpcs.of({
        LoadArea: ({ projectId, folderId }) =>
          items.loadArea(projectId, folderId).pipe(Effect.map(projectArea), mapOperationError),
        AddItem: ({ fields, customValues, reminder, ticket, ...placement }) =>
          Effect.sync(() => ({
            ...placement,
            fields: { ...parseItemEdit(fields), ...(reminder === undefined ? {} : { reminder }) },
            customValues: customValues?.map(parseFieldValueInput) ?? [],
            ticket: ticket ?? null,
          })).pipe(Effect.flatMap(items.add), Effect.map(projectItem), mapOperationError),
        AddTickets: ({ tickets, ...area }) =>
          Effect.sync(() => ({
            ...area,
            tickets: tickets.map(({ fields, ticket }) => ({
              fields: parseItemEdit(fields),
              ticket: ticket ?? null,
            })),
          })).pipe(
            Effect.flatMap(items.addTickets),
            Effect.map((rows) => rows.map(projectItem)),
            mapAddTicketsError,
          ),
        LoadTicket: ({ itemId }) =>
          items.loadTicket(itemId).pipe(Effect.map(projectTicket), mapOperationError),
        AddTicketComment: ({ itemId, body }) =>
          items.addComment(itemId, body).pipe(Effect.map(projectTicketComment), mapOperationError),
        CreateItem: ({ projectId, folderId, parentItemId, title, afterItemId }) =>
          items
            .create(projectId, folderId, parentItemId, title, afterItemId)
            .pipe(Effect.map(projectItem), mapOperationError),
        EditItem: ({
          itemId,
          fields,
          customValues,
          links,
          recurrence,
          reminder,
          ticket,
          confirmedOpenItemIds,
        }) =>
          Effect.sync(() => ({
            edit: {
              ...parseItemEdit(fields),
              ...(recurrence === undefined ? {} : { recurrence: parseRecurrence(recurrence) }),
              ...(reminder === undefined ? {} : { reminder }),
            },
            values: customValues?.map(parseFieldValueInput),
          })).pipe(
            Effect.flatMap(({ edit, values }) =>
              items.edit(itemId, edit, values, confirmedOpenItemIds, links, ticket),
            ),
            Effect.map(projectCompletion),
            mapOperationError,
          ),
        SetItemPriority: ({ itemId, priorityLevelId }) =>
          items.setPriority(itemId, priorityLevelId).pipe(mapOperationError),
        SetItemStatus: ({ itemId, statusId, confirmedOpenItemIds }) =>
          items
            .setStatus(itemId, statusId, confirmedOpenItemIds)
            .pipe(Effect.map(projectCompletion), mapOperationError),
        SetItemCompleted: ({ projectId, folderId, itemId, completed, confirmedOpenItemIds }) =>
          items
            .setCompleted(projectId, folderId, itemId, completed, confirmedOpenItemIds)
            .pipe(Effect.map(projectCompletion), mapOperationError),
        IndentItem: ({ projectId, folderId, itemId }) =>
          items.indent(projectId, folderId, itemId).pipe(mapOperationError),
        OutdentItem: ({ projectId, folderId, itemId }) =>
          items.outdent(projectId, folderId, itemId).pipe(mapOperationError),
        MoveItem: ({ projectId, folderId, itemId, parentItemId }) =>
          items.move(projectId, folderId, itemId, parentItemId).pipe(mapOperationError),
        DropItem: ({ projectId, folderId, itemId, targetItemId, position }) =>
          items.drop(projectId, folderId, itemId, targetItemId, position).pipe(mapOperationError),
        MoveItemToPriorityGroup: ({
          projectId,
          folderId,
          itemId,
          priorityLevelId,
          index,
          levelParentId,
        }) =>
          items
            .moveToPriorityGroup(
              projectId,
              folderId,
              itemId,
              priorityLevelId,
              index,
              levelParentId ?? null,
            )
            .pipe(mapOperationError),
        ReorderItems: ({ projectId, folderId, parentItemId, itemIds }) =>
          items.reorder(projectId, folderId, parentItemId, itemIds).pipe(mapOperationError),
        MoveItemToArea: ({ projectId, sourceFolderId, targetFolderId, itemId }) =>
          items
            .moveToArea(projectId, sourceFolderId, targetFolderId, itemId)
            .pipe(mapOperationError),
        DeleteItem: ({ projectId, folderId, itemId }) =>
          items.delete(projectId, folderId, itemId).pipe(mapOperationError),
        RestoreItems: ({ projectId, folderId, batchId }) =>
          items.restore(projectId, folderId, batchId).pipe(mapOperationError),
        LoadItemFieldValues: ({ itemId }) =>
          items.loadFieldValues(itemId).pipe(
            Effect.map((values) => values.map(projectItemFieldValue)),
            mapOperationError,
          ),
        PushBackOneDay: ({ itemId }) => items.pushBackOneDay(itemId).pipe(mapOperationError),
        SkipRepeat: ({ itemId }) => items.skipRepeat(itemId).pipe(mapOperationError),
        StopRepeating: ({ itemId }) => items.stopRepeating(itemId).pipe(mapOperationError),
        LoadItemLinks: ({ itemId }) =>
          items.loadLinks(itemId).pipe(
            Effect.map((links) => links.map(projectItemLink)),
            mapOperationError,
          ),
      });
    }),
  ).pipe(Layer.provide(ItemService.layer(timeZone)));
