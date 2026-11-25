import type {
  CsvImportPreview,
  CsvImportTarget,
  ItemQuery,
  JsonExportScope,
  JsonImportPreview,
  JsonImportResult,
  TransferError,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import type { FakeProjectStore, SeedProject } from "./fake-task-tracker-server.js";

type TransferRpc =
  | "ExportJson"
  | "PreviewJsonImport"
  | "ImportJson"
  | "ExportProjectCsv"
  | "ExportSearchResultsCsv"
  | "PreviewCsvImport"
  | "ImportCsv";

type Target = typeof CsvImportTarget.Type;

/** One transfer RPC as the fake server received it. */
export type FakeTransferRequest =
  | {
      readonly tag: "ExportJson";
      readonly fileToken: string;
      readonly scope: typeof JsonExportScope.Type;
    }
  | { readonly tag: "PreviewJsonImport" | "ImportJson"; readonly fileToken: string }
  | { readonly tag: "ExportProjectCsv"; readonly fileToken: string; readonly projectId: string }
  | {
      readonly tag: "ExportSearchResultsCsv";
      readonly fileToken: string;
      readonly query: typeof ItemQuery.Type;
    }
  | {
      readonly tag: "PreviewCsvImport" | "ImportCsv";
      readonly fileToken: string;
      readonly target: Target;
    };

/**
 * Transfer answers and recorded requests for import and export tests (§7.9).
 * Tests set what the next export, preview or import returns.
 */
export class FakeTransfer {
  /** Every transfer request in order, with its token and export scope. */
  readonly requests: Array<FakeTransferRequest> = [];
  /** The path every export reports. */
  exportPath = "/home/owner/Documents/task-tracker-export.json";
  /** What `PreviewJsonImport` reports for any token. */
  preview: typeof JsonImportPreview.Type = {
    fileName: "backup.json",
    summary: { projects: 1, folders: 0, items: 2, savedSearches: 0 },
    issues: [],
  };
  /** What `ImportJson` reports for any token. */
  importResult: typeof JsonImportResult.Type = {
    kind: "imported",
    summary: { projects: 1, folders: 0, items: 2, savedSearches: 0 },
    backupPath: "/home/owner/.local/share/task-tracker/tasktracker-import-20261119.db.bak",
  };
  /** What `PreviewCsvImport` reports for any token. */
  csvPreview: typeof CsvImportPreview.Type = {
    fileName: "items.csv",
    rowCount: 2,
    recognizedColumns: ["Title", "Type"],
    unknownColumns: [],
    ignoredColumns: [],
    sampleRows: [
      { rowNumber: 2, title: "One", priority: "", dueDate: "", hasError: false },
      { rowNumber: 3, title: "Two", priority: "", dueDate: "", hasError: false },
    ],
    issues: [],
    canImport: true,
  };
  /** What `ImportCsv` reports for any token. */
  csvImportResult: typeof JsonImportResult.Type = {
    kind: "imported",
    summary: { projects: 0, folders: 0, items: 2, savedSearches: 0 },
    backupPath: "/home/owner/.local/share/task-tracker/tasktracker-import-20261119.db.bak",
  };
  /** How many matches a search results export reports. */
  searchExportCount = 3;
  /** Projects an accepted import adds, so Home can show them after it reloads. */
  importedProjects: Array<SeedProject> = [{ name: "Home Lab", openCount: 2 }];
  /** A failure the named RPC returns instead of its answer. */
  failure: { readonly tag: TransferRpc; readonly error: typeof TransferError.Type } | null = null;
}

const failOr = <A>(store: FakeProjectStore, tag: TransferRpc, answer: () => A) => {
  const failure = store.transfer.failure;
  return failure !== null && failure.tag === tag ? Effect.fail(failure.error) : Effect.sync(answer);
};

function importAnswer(store: FakeProjectStore) {
  const result = store.transfer.importResult;
  if (result.kind === "imported") {
    store.transfer.importedProjects.forEach((project) => store.add(project));
  }
  return result;
}

/** Records a request and answers it, unless a failure was set for its RPC. */
function answer<A>(store: FakeProjectStore, request: FakeTransferRequest, reply: () => A) {
  store.transfer.requests.push(request);
  return store.record(request.tag).pipe(Effect.andThen(failOr(store, request.tag, reply)));
}

/** The CSV transfer RPCs backed by {@link FakeTransfer}. */
function csvTransferHandlers(store: FakeProjectStore) {
  const { transfer } = store;
  type Token = { fileToken: string };
  return {
    ExportProjectCsv: ({ projectId, fileToken }: Token & { projectId: string }) =>
      answer(store, { tag: "ExportProjectCsv", projectId, fileToken }, () => ({
        path: transfer.exportPath.replace(/\.json$/, ".csv"),
      })),
    ExportSearchResultsCsv: ({ query, fileToken }: Token & { query: typeof ItemQuery.Type }) =>
      answer(store, { tag: "ExportSearchResultsCsv", query, fileToken }, () => ({
        path: "/home/owner/Documents/search-results.csv",
        count: transfer.searchExportCount,
      })),
    PreviewCsvImport: ({ fileToken, target }: Token & { target: Target }) =>
      answer(store, { tag: "PreviewCsvImport", fileToken, target }, () => transfer.csvPreview),
    ImportCsv: ({ fileToken, target }: Token & { target: Target }) =>
      answer(store, { tag: "ImportCsv", fileToken, target }, () => transfer.csvImportResult),
  };
}

/** Every transfer RPC backed by {@link FakeTransfer}. */
export function transferHandlers(store: FakeProjectStore) {
  const { transfer } = store;
  return {
    ExportJson: ({
      scope,
      fileToken,
    }: {
      scope: typeof JsonExportScope.Type;
      fileToken: string;
    }) => {
      transfer.requests.push({ tag: "ExportJson", scope, fileToken });
      return store
        .record("ExportJson")
        .pipe(Effect.andThen(failOr(store, "ExportJson", () => ({ path: transfer.exportPath }))));
    },
    PreviewJsonImport: ({ fileToken }: { fileToken: string }) => {
      transfer.requests.push({ tag: "PreviewJsonImport", fileToken });
      return store
        .record("PreviewJsonImport")
        .pipe(Effect.andThen(failOr(store, "PreviewJsonImport", () => transfer.preview)));
    },
    ImportJson: ({ fileToken }: { fileToken: string }) => {
      transfer.requests.push({ tag: "ImportJson", fileToken });
      return store
        .record("ImportJson")
        .pipe(Effect.andThen(failOr(store, "ImportJson", () => importAnswer(store))));
    },
    ...csvTransferHandlers(store),
  };
}
