import { LookupRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { LookupService } from "../services/lookup-service.js";
import { projectPriorityLevel } from "./priority-level-projection.js";
import { mapOperationError } from "./map-operation-error.js";

/** Bind workflow status and priority level management to the lookup service. */
export const lookupRpcHandlers = LookupRpcs.toLayer(
  Effect.gen(function* () {
    const { priorityLevels, statuses } = yield* LookupService;
    return LookupRpcs.of({
      ListStatuses: () => statuses.list().pipe(mapOperationError),
      AddStatus: ({ name, kind }) => statuses.add(name, kind).pipe(mapOperationError),
      RenameStatus: ({ id, name }) => statuses.rename(id, name).pipe(mapOperationError),
      ArchiveStatus: ({ id }) => statuses.archive(id).pipe(mapOperationError),
      RestoreStatus: ({ id }) => statuses.restore(id).pipe(mapOperationError),
      SetStatusInProgress: ({ id, isInProgress }) =>
        statuses.setInProgress(id, isInProgress).pipe(mapOperationError),
      ReorderStatuses: ({ ids }) => statuses.reorder(ids).pipe(mapOperationError),
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
