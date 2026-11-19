import { TrashRpcs } from "@task-tracker/contracts";
import { FloatingTime } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { TrashService } from "../services/trash-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** Send the deletion time as the server zone's wall-clock reading (§5.4). */
function trashBatchProjection<Listed extends { readonly deletedAtUtc: string }>(
  { deletedAtUtc, ...batch }: Listed,
  timeZone: string,
) {
  const local = FloatingTime.toFloating(Temporal.Instant.from(deletedAtUtc), timeZone);
  return { ...batch, deletedAt: local.toString({ smallestUnit: "second" }) };
}

/** Bind the Trash RPCs to the transactional Trash service in the server's zone. */
export const trashRpcHandlers = (timeZone: string) =>
  TrashRpcs.toLayer(
    Effect.gen(function* () {
      const trash = yield* TrashService;
      return {
        ListTrash: ({ projectId }) =>
          trash.list(projectId).pipe(
            Effect.map((batches) => batches.map((batch) => trashBatchProjection(batch, timeZone))),
            mapOperationError,
          ),
        RestoreTrashBatch: ({ batchId }) => trash.restore(batchId).pipe(mapOperationError),
        PurgeTrashBatch: ({ batchId }) => trash.purge(batchId).pipe(mapOperationError),
        EmptyTrash: ({ projectId }) => trash.empty(projectId).pipe(mapOperationError),
      };
    }),
  ).pipe(Layer.provide(TrashService.layer));
