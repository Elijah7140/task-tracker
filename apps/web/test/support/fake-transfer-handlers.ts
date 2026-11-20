import type {
  JsonExportScope,
  JsonImportPreview,
  JsonImportResult,
  TransferError,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import type { FakeProjectStore, SeedProject } from "./fake-task-tracker-server.js";

type TransferRpc = "ExportJson" | "PreviewJsonImport" | "ImportJson";

/** One transfer RPC as the fake server received it. */
export type FakeTransferRequest =
  | {
      readonly tag: "ExportJson";
      readonly fileToken: string;
      readonly scope: typeof JsonExportScope.Type;
    }
  | { readonly tag: "PreviewJsonImport" | "ImportJson"; readonly fileToken: string };

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

/** `ExportJson`, `PreviewJsonImport` and `ImportJson` backed by {@link FakeTransfer}. */
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
  };
}
