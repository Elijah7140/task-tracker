import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { DatabaseBackup } from "../../src/services/transfer/database-backup.js";
import { TransferFileGrants } from "../../src/services/transfer/transfer-file-grants.js";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const folder = mkdtempSync(join(tmpdir(), "tasktracker-transfer-rpc-"));
const exported = join(folder, "export.json");
const grants = [
  { type: "transfer-file-grant", token: "W".repeat(43), path: exported, access: "write" },
  { type: "transfer-file-grant", token: "R".repeat(43), path: exported, access: "read" },
] as const;

/** Grants come from Electron main in the app; here the layer grants two fixed tokens. */
const transfer = Layer.merge(
  Layer.effectDiscard(
    Effect.gen(function* () {
      const files = yield* TransferFileGrants;
      yield* Effect.forEach(grants, files.grant, { discard: true });
    }),
  ).pipe(Layer.provideMerge(TransferFileGrants.layer)),
  Layer.succeed(DatabaseBackup, {
    createImportBackup: Effect.succeed(join(folder, "backup.db.bak")),
  }),
);

const fields = {
  title: "Pay invoices",
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: "2026-11-13",
  dueTime: "07:00:00",
};

it.effect(
  "Exports to a granted file, previews it and imports it as a new project that reminds",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const project = yield* client.CreateProject({ name: "Billing" });
        const item = yield* client.CreateItem({
          projectId: project.id,
          folderId: null,
          parentItemId: null,
          title: "Pay invoices",
        });
        yield* client.EditItem({
          itemId: item.id,
          fields,
          reminder: { kind: "offset", minutes: 0 },
        });
        const first = yield* client.WatchReminders({ afterVersion: -1 });
        yield* client.DismissReminder({ itemId: item.id });
        const dismissed = yield* client.WatchReminders({ afterVersion: first.version });

        const result = yield* client.ExportJson({
          scope: { kind: "all" },
          fileToken: grants[0].token,
        });
        const preview = yield* client.PreviewJsonImport({ fileToken: grants[1].token });
        const imported = yield* client.ImportJson({ fileToken: grants[1].token });
        const reminders = yield* client.WatchReminders({ afterVersion: dismissed.version });

        expect(result).toEqual({ path: exported });
        expect(preview).toEqual({
          fileName: "export.json",
          summary: { projects: 1, folders: 0, items: 1, savedSearches: 0 },
          issues: [],
        });
        expect(imported).toEqual({
          kind: "imported",
          summary: { projects: 1, folders: 0, items: 1, savedSearches: 0 },
          backupPath: join(folder, "backup.db.bak"),
        });
        expect((yield* client.ListProjects()).map((summary) => summary.project.name)).toEqual([
          "Billing",
          "Billing (imported)",
        ]);
        expect(reminders.reminders.map((entry) => entry.projectName)).toEqual([
          "Billing (imported)",
        ]);
        rmSync(folder, { recursive: true, force: true });
      }),
      transfer,
    ),
);

const csvFolder = mkdtempSync(join(tmpdir(), "tasktracker-transfer-csv-rpc-"));
const csvFile = join(csvFolder, "items.csv");
const resultsFile = join(csvFolder, "results.csv");
const csvGrants = [
  { type: "transfer-file-grant", token: "C".repeat(43), path: csvFile, access: "write" },
  { type: "transfer-file-grant", token: "S".repeat(43), path: resultsFile, access: "write" },
  { type: "transfer-file-grant", token: "I".repeat(43), path: csvFile, access: "read" },
  { type: "transfer-file-grant", token: "J".repeat(43), path: csvFile, access: "read" },
] as const;

const csvTransfer = Layer.merge(
  Layer.effectDiscard(
    Effect.gen(function* () {
      const files = yield* TransferFileGrants;
      yield* Effect.forEach(csvGrants, files.grant, { discard: true });
    }),
  ).pipe(Layer.provideMerge(TransferFileGrants.layer)),
  Layer.succeed(DatabaseBackup, {
    createImportBackup: Effect.succeed(join(csvFolder, "backup.db.bak")),
  }),
);

it.effect(
  "Exports a project and search results as CSV, previews the file and imports it into a folder",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const project = yield* client.CreateProject({ name: "Billing" });
        const folder = yield* client.CreateFolder({
          projectId: project.id,
          parentFolderId: null,
          name: "Inbox",
        });
        const item = yield* client.CreateItem({
          projectId: project.id,
          folderId: null,
          parentItemId: null,
          title: "Pay invoices",
        });
        yield* client.EditItem({
          itemId: item.id,
          fields,
          reminder: { kind: "offset", minutes: 0 },
        });
        const query = {
          scope: { kind: "allProjects" },
          text: null,
          filters: [],
          includeCompleted: false,
        } as const;
        const target = { projectId: project.id, folderId: folder.id };

        const exported = yield* client.ExportProjectCsv({
          projectId: project.id,
          fileToken: csvGrants[0].token,
        });
        const results = yield* client.ExportSearchResultsCsv({
          query,
          fileToken: csvGrants[1].token,
        });
        const preview = yield* client.PreviewCsvImport({ fileToken: csvGrants[2].token, target });
        const imported = yield* client.ImportCsv({ fileToken: csvGrants[3].token, target });
        const inbox = yield* client.LoadArea({ projectId: project.id, folderId: folder.id });

        expect(exported).toEqual({ path: csvFile });
        expect(results).toEqual({ path: resultsFile, count: 1 });
        expect(readFileSync(resultsFile).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
        expect(preview).toMatchObject({
          fileName: "items.csv",
          rowCount: 1,
          canImport: true,
          issues: [],
        });
        expect(imported).toEqual({
          kind: "imported",
          summary: { projects: 0, folders: 0, items: 1, savedSearches: 0 },
          backupPath: join(csvFolder, "backup.db.bak"),
        });
        expect(JSON.stringify(inbox)).toContain("Pay invoices");
        rmSync(csvFolder, { recursive: true, force: true });
      }),
      csvTransfer,
    ),
);
