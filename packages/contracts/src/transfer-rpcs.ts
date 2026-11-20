import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { ItemQuery } from "./search.js";
import {
  CsvImportPreview,
  CsvImportResult,
  CsvImportTarget,
  JsonExportResult,
  JsonExportScope,
  JsonImportPreview,
  JsonImportResult,
  TransferError,
  SearchResultsExportResult,
  TransferFileToken,
} from "./transfer.js";

/**
 * JSON and CSV import and export (§7.9). Files are named by tokens that Electron
 * main issued for a dialog choice. Exports read data; imports add new data after
 * a backup in one transaction and record no undo step.
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
  Rpc.make("ExportProjectCsv", {
    payload: { projectId: Guid, fileToken: TransferFileToken },
    success: JsonExportResult,
    error: TransferError,
  }),
  Rpc.make("ExportSearchResultsCsv", {
    payload: { query: ItemQuery, fileToken: TransferFileToken },
    success: SearchResultsExportResult,
    error: TransferError,
  }),
  Rpc.make("PreviewCsvImport", {
    payload: { fileToken: TransferFileToken, target: CsvImportTarget },
    success: CsvImportPreview,
    error: TransferError,
  }),
  Rpc.make("ImportCsv", {
    payload: { fileToken: TransferFileToken, target: CsvImportTarget },
    success: CsvImportResult,
    error: TransferError,
  }),
);
