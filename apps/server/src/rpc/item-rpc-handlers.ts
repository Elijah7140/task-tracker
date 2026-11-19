import { ItemRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { ItemService } from "../services/item-service.js";
import { parseItemEdit, projectArea, projectCompletion, projectItem } from "./item-projection.js";
import { parseFieldValueInput, projectItemFieldValue } from "./field-value-projection.js";

import { mapOperationError } from "./map-operation-error.js";

/** Delegate item calls to the service with the same clock, time zone and database as the server. */
export const itemRpcHandlers = (timeZone: string) =>
  ItemRpcs.toLayer(
    Effect.gen(function* () {
      const items = yield* ItemService;
      return ItemRpcs.of({
        LoadArea: ({ projectId, folderId }) =>
          items.loadArea(projectId, folderId).pipe(Effect.map(projectArea), mapOperationError),
        CreateItem: ({ projectId, folderId, parentItemId, title }) =>
          items
            .create(projectId, folderId, parentItemId, title)
            .pipe(Effect.map(projectItem), mapOperationError),
        EditItem: ({ itemId, fields, customValues }) =>
          Effect.sync(() => ({
            edit: parseItemEdit(fields),
            values: customValues?.map(parseFieldValueInput),
          })).pipe(
            Effect.flatMap(({ edit, values }) => items.edit(itemId, edit, values)),
            mapOperationError,
          ),
        SetItemPriority: ({ itemId, priorityLevelId }) =>
          items.setPriority(itemId, priorityLevelId).pipe(mapOperationError),
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
      });
    }),
  ).pipe(Layer.provide(ItemService.layer(timeZone)));
