import { CurrentItemRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { CurrentItemService } from "../services/current-item-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** Bind the current-item RPCs to the transactional current-item service (§7.18). */
export const currentItemRpcHandlers = CurrentItemRpcs.toLayer(
  Effect.gen(function* () {
    const current = yield* CurrentItemService;
    return {
      LoadCurrentItem: () => current.load.pipe(mapOperationError),
      SetCurrentItem: ({ itemId }) => current.set(itemId).pipe(mapOperationError),
    };
  }),
).pipe(Layer.provide(CurrentItemService.layer));
