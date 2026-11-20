import { type RpcOperationError, TransferFailed, TransferRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { ReminderScheduler } from "../services/reminder-scheduler.js";
import { SearchService } from "../services/search-service.js";
import { TransferFileError } from "../services/transfer/transfer-file-error.js";
import { type ImportResult, TransferService } from "../services/transfer/transfer-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** File problems keep their message for the user; everything else maps as usual. */
type TransferRpcError = TransferFailed | typeof RpcOperationError.Type;

function mapTransferError<A, E, R>(
  operation: Effect.Effect<A, E, R>,
): Effect.Effect<A, TransferRpcError, R> {
  return operation.pipe(
    Effect.catch((error): Effect.Effect<never, TransferRpcError> =>
      error instanceof TransferFileError
        ? Effect.fail(new TransferFailed({ message: error.message }))
        : mapOperationError(Effect.fail(error)),
    ),
    Effect.catchDefect((defect): Effect.Effect<never, TransferRpcError> =>
      mapOperationError(Effect.die(defect)),
    ),
  );
}

/**
 * Binds the transfer RPCs (§7.9). A successful JSON or CSV import asks the reminder scheduler
 * to check soon, since imported items may already be due (§7.12).
 */
export const transferRpcHandlers = TransferRpcs.toLayer(
  Effect.gen(function* () {
    const transfer = yield* TransferService;
    const scheduler = yield* ReminderScheduler;
    const checkRemindersAfter = <E, R>(
      operation: Effect.Effect<ImportResult, E, R>,
    ): Effect.Effect<ImportResult, E, R> =>
      operation.pipe(
        Effect.tap((result) => (result.kind === "imported" ? scheduler.requestCheck : Effect.void)),
      );
    return TransferRpcs.of({
      ExportJson: ({ scope, fileToken }) => mapTransferError(transfer.exportJson(scope, fileToken)),
      PreviewJsonImport: ({ fileToken }) => mapTransferError(transfer.previewJsonImport(fileToken)),
      ImportJson: ({ fileToken }) =>
        mapTransferError(checkRemindersAfter(transfer.importJson(fileToken))),
      ExportProjectCsv: ({ projectId, fileToken }) =>
        mapTransferError(transfer.exportProjectCsv(projectId, fileToken)),
      ExportSearchResultsCsv: ({ query, fileToken }) =>
        mapTransferError(transfer.exportSearchResultsCsv(query, fileToken)),
      PreviewCsvImport: ({ fileToken, target }) =>
        mapTransferError(transfer.previewCsvImport(fileToken, target)),
      ImportCsv: ({ fileToken, target }) =>
        mapTransferError(checkRemindersAfter(transfer.importCsv(fileToken, target))),
    });
  }),
).pipe(Layer.provide(TransferService.layer), Layer.provide(SearchService.layer));
