import { mkdtempSync, rmSync } from "node:fs";
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
  scheduledStart: null,
  scheduledEnd: null,
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
