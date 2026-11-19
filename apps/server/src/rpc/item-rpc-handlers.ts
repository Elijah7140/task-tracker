import {
  ItemHierarchyError,
  ItemRpcs,
  ItemStorageError,
  ItemValidationError,
} from "@task-tracker/contracts";
import { HierarchyError, MetadataRuleError } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { ItemService } from "../services/item-service.js";
import { parseItemEdit, projectArea, projectCompletion, projectItem } from "./item-projection.js";

function itemFailure(error: Error) {
  if (error instanceof HierarchyError) {
    return new ItemHierarchyError({ message: error.message });
  }
  if (error instanceof MetadataRuleError) {
    return new ItemValidationError({ message: error.message });
  }
  return new ItemStorageError({ message: "Could not complete the item operation." });
}

/** Delegate item calls to the service with the same clock, time zone and database as the server. */
export const itemRpcHandlers = (timeZone: string) =>
  ItemRpcs.toLayer(
    Effect.gen(function* () {
      const items = yield* ItemService;
      return ItemRpcs.of({
        LoadArea: ({ projectId, folderId }) =>
          items
            .loadArea(projectId, folderId)
            .pipe(Effect.map(projectArea), Effect.mapError(itemFailure)),
        CreateItem: ({ projectId, folderId, parentItemId, title }) =>
          items
            .create(projectId, folderId, parentItemId, title)
            .pipe(Effect.map(projectItem), Effect.mapError(itemFailure)),
        EditItem: ({ itemId, fields }) =>
          items.edit(itemId, parseItemEdit(fields)).pipe(Effect.mapError(itemFailure)),
        SetItemCompleted: ({ projectId, folderId, itemId, completed, confirmedOpenItemIds }) =>
          items
            .setCompleted(projectId, folderId, itemId, completed, confirmedOpenItemIds)
            .pipe(Effect.map(projectCompletion), Effect.mapError(itemFailure)),
        IndentItem: ({ projectId, folderId, itemId }) =>
          items.indent(projectId, folderId, itemId).pipe(Effect.mapError(itemFailure)),
        OutdentItem: ({ projectId, folderId, itemId }) =>
          items.outdent(projectId, folderId, itemId).pipe(Effect.mapError(itemFailure)),
        MoveItem: ({ projectId, folderId, itemId, parentItemId }) =>
          items.move(projectId, folderId, itemId, parentItemId).pipe(Effect.mapError(itemFailure)),
        ReorderItems: ({ projectId, folderId, parentItemId, itemIds }) =>
          items
            .reorder(projectId, folderId, parentItemId, itemIds)
            .pipe(Effect.mapError(itemFailure)),
        MoveItemToArea: ({ projectId, sourceFolderId, targetFolderId, itemId }) =>
          items
            .moveToArea(projectId, sourceFolderId, targetFolderId, itemId)
            .pipe(Effect.mapError(itemFailure)),
        DeleteItem: ({ projectId, folderId, itemId }) =>
          items.delete(projectId, folderId, itemId).pipe(Effect.mapError(itemFailure)),
        RestoreItems: ({ projectId, folderId, batchId }) =>
          items.restore(projectId, folderId, batchId).pipe(Effect.mapError(itemFailure)),
      });
    }),
  ).pipe(Layer.provide(ItemService.layer(timeZone)));
