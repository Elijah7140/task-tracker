import { LookupRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { LookupService } from "../services/lookup-service.js";
import { projectPriorityLevel } from "./priority-level-projection.js";
import { mapOperationError } from "./map-operation-error.js";

/** Bind item type and priority level management to the lookup service. */
export const lookupRpcHandlers = LookupRpcs.toLayer(
  Effect.gen(function* () {
    const { itemTypes, priorityLevels } = yield* LookupService;
    return LookupRpcs.of({
      ListItemTypes: () => itemTypes.list().pipe(mapOperationError),
      AddItemType: ({ name }) => itemTypes.add(name).pipe(mapOperationError),
      RenameItemType: ({ id, name }) => itemTypes.rename(id, name).pipe(mapOperationError),
      ArchiveItemType: ({ id }) => itemTypes.archive(id).pipe(mapOperationError),
      RestoreItemType: ({ id }) => itemTypes.restore(id).pipe(mapOperationError),
      ReorderItemTypes: ({ ids }) => itemTypes.reorder(ids).pipe(mapOperationError),
      ListPriorityLevels: () =>
        priorityLevels.list().pipe(
          Effect.map((rows) => rows.map(projectPriorityLevel)),
          mapOperationError,
        ),
      AddPriorityLevel: ({ name, number }) =>
        priorityLevels.add(name, number).pipe(Effect.map(projectPriorityLevel), mapOperationError),
      SetPriorityNumber: ({ id, number }) =>
        priorityLevels.setNumber(id, number).pipe(mapOperationError),
      RenamePriorityLevel: ({ id, name }) =>
        priorityLevels.rename(id, name).pipe(mapOperationError),
      ArchivePriorityLevel: ({ id }) => priorityLevels.archive(id).pipe(mapOperationError),
      RestorePriorityLevel: ({ id }) => priorityLevels.restore(id).pipe(mapOperationError),
      ReorderPriorityLevels: ({ ids }) => priorityLevels.reorder(ids).pipe(mapOperationError),
    });
  }),
).pipe(Layer.provide(LookupService.layer));
