import { exportCsv, planCsvImport, type ItemQuery } from "@task-tracker/core";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { newId } from "../new-id.js";
import { operationTime } from "../operation-time.js";
import { SearchService } from "../search-service.js";
import { UndoService } from "../undo-service.js";
import { loadCsvImportContext, writeCsvRows, type CsvImportTarget } from "./csv-import.js";
import { DatabaseBackup } from "./database-backup.js";
import { loadActiveProjects, loadExportCatalogue, loadProjectForCsv } from "./export-loader.js";
import type { ImportResult } from "./transfer-service.js";
import { TransferFileGrants } from "./transfer-file-grants.js";
import { readTransferFile, transferFileName, writeTransferFile } from "./transfer-files.js";

/** The most matches a search results export writes; the page shows only the first 200. */
export const EXPORT_RESULT_LIMIT = 1_000_000;

const upper = (target: CsvImportTarget): CsvImportTarget => ({
  projectId: target.projectId.toUpperCase(),
  folderId: target.folderId?.toUpperCase() ?? null,
});

/** CSV export and import operations of the transfer service (§7.9). */
export const makeCsvTransfer = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const grants = yield* TransferFileGrants;
  const backup = yield* DatabaseBackup;
  const search = yield* SearchService;

  /** Writes every active item of a project, in screen order, to the chosen `.csv` file. */
  const exportProjectCsv = Effect.fnUntraced(function* (projectId: string, token: string) {
    const path = yield* grants.path(token, "write", true, "csv");
    const text = yield* sql.withTransaction(
      Effect.gen(function* () {
        const projects = yield* loadProjectForCsv(sql, projectId.toUpperCase());
        return exportCsv(yield* loadExportCatalogue(sql), projects, null);
      }),
    );
    yield* writeTransferFile(path, text, "csv");
    return { path };
  });

  /**
   * Re-runs a search without the page's 200-row limit and writes every match,
   * in result order, to the chosen `.csv` file. The search and the export read
   * one snapshot.
   */
  const exportSearchResultsCsv = Effect.fnUntraced(function* (query: ItemQuery, token: string) {
    const path = yield* grants.path(token, "write", true, "csv");
    const { text, count } = yield* sql.withTransaction(
      Effect.gen(function* () {
        const page = yield* search.search(query, EXPORT_RESULT_LIMIT);
        const projects = yield* loadActiveProjects(
          sql,
          page.items.map((item) => item.projectId),
        );
        const order = page.items.map((item) => item.itemId);
        return {
          text: exportCsv(yield* loadExportCatalogue(sql), projects, order),
          count: order.length,
        };
      }),
    );
    yield* writeTransferFile(path, text, "csv");
    return { path, count };
  });

  /** Reads the chosen file against the target and previews it without writing anything. */
  const previewCsvImport = Effect.fnUntraced(function* (token: string, target: CsvImportTarget) {
    const path = yield* grants.path(token, "read", false, "csv");
    const text = yield* readTransferFile(path, "csv");
    const preview = yield* sql.withTransaction(
      Effect.gen(function* () {
        const context = yield* loadCsvImportContext(sql, upper(target));
        return planCsvImport(text, context, yield* operationTime).preview;
      }),
    );
    return { fileName: transferFileName(path), ...preview };
  });

  /** Plans against current data, backs up, then writes the rows in this transaction. */
  const applyCsvImport = (text: string, target: CsvImportTarget) =>
    Effect.gen(function* () {
      const now = yield* operationTime;
      const plan = planCsvImport(text, yield* loadCsvImportContext(sql, target), now);
      if (!plan.preview.canImport) {
        const refused: ImportResult = { kind: "refused", issues: plan.preview.issues };
        return refused;
      }
      const backupPath = yield* backup.createImportBackup;
      yield* writeCsvRows(sql, plan.rows, target, now, () => newId(now));
      const summary = { projects: 0, folders: 0, items: plan.rows.length, savedSearches: 0 };
      const imported: ImportResult = { kind: "imported", summary, backupPath };
      return imported;
    });

  /**
   * Re-reads and revalidates the chosen file, then adds its rows as new
   * top-level items at the end of the target area in one transaction after a
   * backup. Imports record no undo step (§7.8, §7.9).
   */
  const importCsv = Effect.fnUntraced(function* (token: string, target: CsvImportTarget) {
    const path = yield* grants.path(token, "read", true, "csv");
    const text = yield* readTransferFile(path, "csv");
    const result: ImportResult = yield* undo.record(applyCsvImport(text, upper(target)));
    return result;
  });

  return { exportProjectCsv, exportSearchResultsCsv, previewCsvImport, importCsv };
});
