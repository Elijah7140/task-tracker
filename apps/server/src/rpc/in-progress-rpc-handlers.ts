import { InProgressRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { InProgressService } from "../services/in-progress-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** Bind the tray card's in-progress stack to its transactional service (§7.18). */
export const inProgressRpcHandlers = (timeZone: string) =>
  InProgressRpcs.toLayer(
    Effect.gen(function* () {
      const inProgress = yield* InProgressService;
      return {
        LoadInProgressItems: () => inProgress.load.pipe(mapOperationError),
      };
    }),
  ).pipe(Layer.provide(InProgressService.layer(timeZone)));
