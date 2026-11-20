import { Rpc, RpcGroup } from "effect/rpc";
import {
  JsonExportResult,
  JsonExportScope,
  JsonImportPreview,
  JsonImportResult,
  TransferError,
  TransferFileToken,
} from "./transfer.js";

/**
 * JSON import and export (§7.9). Files are named by tokens that Electron main
 * issued for a dialog choice. Exports read data; imports add new data after a
 * backup in one transaction and record no undo step.
 */
export const TransferRpcs = RpcGroup.make(
  Rpc.make("ExportJson", {
    payload: { scope: JsonExportScope, fileToken: TransferFileToken },
    success: JsonExportResult,
    error: TransferError,
  }),
  Rpc.make("PreviewJsonImport", {
    payload: { fileToken: TransferFileToken },
    success: JsonImportPreview,
    error: TransferError,
  }),
  Rpc.make("ImportJson", {
    payload: { fileToken: TransferFileToken },
    success: JsonImportResult,
    error: TransferError,
  }),
);
