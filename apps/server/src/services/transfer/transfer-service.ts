import { EOL } from "node:os";
import {
  buildExportDocument,
  readJsonImport,
  writeJson,
  type TransferIssue,
} from "@task-tracker/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { fieldRepository } from "../../db/repositories/field-repository.js";
import { lookupRepository } from "../../db/repositories/lookup-repository.js";
import { projectRepository } from "../../db/repositories/project-repository.js";
import { savedSearchRepository } from "../../db/repositories/saved-search-repository.js";
import { settingsRepository } from "../../db/repositories/settings-repository.js";
import { statusRepository } from "../../db/repositories/status-repository.js";
import { newId } from "../new-id.js";
import { operationTime } from "../operation-time.js";
import { UndoService } from "../undo-service.js";
import { DatabaseBackup } from "./database-backup.js";
import { makeCsvTransfer } from "./csv-transfer.js";
import { loadExportSource } from "./export-loader.js";
import { ticketListRepository } from "../../db/repositories/ticket-list-repository.js";
import type { ImportExisting } from "./import-plan.js";
import { writeImportPlan } from "./import-writer.js";
import { planJsonImport } from "./json-import-planner.js";
import { TransferFileGrants } from "./transfer-file-grants.js";
import { readTransferFile, transferFileName, writeTransferFile } from "./transfer-files.js";

/** What a JSON export covers. */
export type ExportScope =
  | { readonly kind: "all" }
  | { readonly kind: "project"; readonly projectId: string };

/** The outcome of an import. */
export type ImportResult =
  | {
      readonly kind: "imported";
      readonly summary: import("@task-tracker/core").TransferSummary;
      readonly backupPath: string;
    }
  | { readonly kind: "refused"; readonly issues: readonly TransferIssue[] };

const loadExisting = Effect.fnUntraced(function* (sql: SqlClient.SqlClient) {
  const lookups = lookupRepository(sql);
  const fields = fieldRepository(sql);
  const existing: ImportExisting = {
    priorityLevels: yield* lookups.priorityLevels.list(),
    statuses: yield* statusRepository(sql).list(),
    fields: yield* fields.definitions.list(),
    choices: yield* fields.choices.listAll(undefined),
    projects: yield* projectRepository(sql).listAll(undefined),
    globalSettings: yield* settingsRepository(sql).global(),
    savedSearches: yield* savedSearchRepository(sql).list(),
    ticketLists: yield* ticketListRepository(sql).list(),
  };
  return existing;
});

const make = (newline: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const undo = yield* UndoService;
    const grants = yield* TransferFileGrants;
    const backup = yield* DatabaseBackup;

    /** Writes the whole database or one project as version 1 JSON to the chosen file. */
    const exportJson = Effect.fnUntraced(function* (scope: ExportScope, token: string) {
      const path = yield* grants.path(token, "write", true, "json");
      const now = yield* operationTime;
      const projectId = scope.kind === "project" ? scope.projectId.toUpperCase() : null;
      const source = yield* sql.withTransaction(loadExportSource(sql, projectId, now));
      yield* writeTransferFile(path, writeJson(buildExportDocument(source), newline), "json");
      return { path };
    });

    /** Reads and checks the chosen file without changing anything. */
    const previewJsonImport = Effect.fnUntraced(function* (token: string) {
      const path = yield* grants.path(token, "read", false, "json");
      const check = readJsonImport(yield* readTransferFile(path, "json"));
      return { fileName: transferFileName(path), summary: check.summary, issues: check.issues };
    });

    /** Plans against current data, backs up, then writes everything in this transaction. */
    const applyImport = (document: NonNullable<ReturnType<typeof readJsonImport>["document"]>) =>
      Effect.gen(function* () {
        const now = yield* operationTime;
        const outcome = planJsonImport(document, yield* loadExisting(sql), now, () => newId(now));
        if (outcome.kind === "refused") {
          return outcome;
        }
        const backupPath = yield* backup.createImportBackup;
        yield* writeImportPlan(sql, outcome.plan);
        return { kind: "imported" as const, summary: outcome.summary, backupPath };
      });

    /**
     * Re-reads and revalidates the chosen file, then adds it as new data in one
     * transaction after a backup. Imports record no undo step (§7.8, §7.9).
     */
    const importJson = Effect.fnUntraced(function* (token: string) {
      const path = yield* grants.path(token, "read", true, "json");
      const check = readJsonImport(yield* readTransferFile(path, "json"));
      if (check.document === null || check.issues.length > 0) {
        const refused: ImportResult = { kind: "refused", issues: check.issues };
        return refused;
      }
      const result: ImportResult = yield* undo.record(applyImport(check.document));
      return result;
    });

    const csv = yield* makeCsvTransfer;

    return { exportJson, previewJsonImport, importJson, ...csv };
  });

/**
 * JSON and CSV export and import (§7.9): exports read in one transaction,
 * imports write in one after a backup. Needs the search service for exporting
 * search results.
 */
export class TransferService extends Context.Service<TransferService>()(
  "@task-tracker/server/TransferService",
  { make: make(EOL) },
) {
  /** Writes exports with the platform line ending, as the legacy exporter did. */
  static readonly layer = Layer.effect(this, make(EOL));
  /** Writes exports with a fixed line ending, for byte comparisons in tests. */
  static readonly layerWithNewline = (newline: string) => Layer.effect(this, make(newline));
}
