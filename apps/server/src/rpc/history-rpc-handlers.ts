import { HistoryRpcs } from "@task-tracker/contracts";
import { Effect } from "effect";
import { UndoService } from "../services/undo-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** Exposes the same history shared by the application write services. */
export const historyRpcHandlers = HistoryRpcs.toLayer(
  Effect.gen(function* () {
    const history = yield* UndoService;
    return {
      GetHistory: () => history.status().pipe(mapOperationError),
      ApplyHistory: ({ direction }) => history.apply(direction).pipe(mapOperationError),
    };
  }),
);
