import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import { databaseLayer } from "../../../../src/db/database-layer.js";
import { ProjectService } from "../../../../src/services/project-service.js";
import { SearchService } from "../../../../src/services/search-service.js";
import { DatabaseBackup } from "../../../../src/services/transfer/database-backup.js";
import {
  isTransferPath,
  TransferFileGrants,
} from "../../../../src/services/transfer/transfer-file-grants.js";
import { TransferService } from "../../../../src/services/transfer/transfer-service.js";
import { UndoService } from "../../../../src/services/undo-service.js";
import { createProject } from "./csv-setup.js";
import { parseJson } from "./transfer-json.js";
import { countRows, projectId, readProjects } from "./transfer-rows.js";
import { emptyWorld, fixturePath, fixtureText, seededWorld, startedAt } from "./transfer-world.js";

const seed = fixtureText("legacy-export-all.json");
const minimal = (name: string) =>
  JSON.stringify({
    format: "task-tracker",
    version: 1,
    projects: [{ id: crypto.randomUUID(), name }],
  });

describe("Transfer service exports", () => {
  it.effect("Refuses to export a deleted project", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const [trashed] = yield* world.sql<{
          Id: string;
        }>`SELECT Id FROM Project WHERE Name = 'Trashed'`;

        const failure = yield* Effect.flip(
          world.exportJson({ kind: "project", projectId: trashed!.Id }),
        );

        expect(failure).toMatchObject({
          entity: "Project",
          message: "Project is missing or deleted.",
        });
      }),
    ),
  );

  it.effect("Gives identical text when exporting twice", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const first = yield* world.exportJson();
        const second = yield* world.exportJson();

        expect(second).toBe(first);
      }),
    ),
  );

  it.effect("Writes the export time, leaves out deleted rows and keeps readable Unicode", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const text = yield* world.exportJson();

        const document = parseJson(text);
        expect(document.exportedAtUtc).toBe("2026-11-13T12:00:00Z");
        expect(document.projects.map((project: { name: string }) => project.name)).toEqual([
          "Billing",
          "Café Überblick 🚀",
          "Home Lab",
        ]);
        expect(text).not.toContain("Old idea");
        expect(text).toContain("Café Überblick \\uD83D\\uDE80");
        expect(text.startsWith("{\n")).toBe(true);
      }),
    ),
  );

  it.effect(
    "Holds only one project, its lookups and fields, and no global settings in a project export",
    () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const home = yield* projectId(world, "Home Lab");

          const document = parseJson(yield* world.exportJson({ kind: "project", projectId: home }));

          expect(document.scope).toBe("project");
          expect(document.projects.map((project: { name: string }) => project.name)).toEqual([
            "Home Lab",
          ]);
          expect(document).not.toHaveProperty("itemTypes");
          expect(document.fields.map((field: { key: string }) => field.key)).toEqual(["estimate"]);
          expect(document.savedSearches).toEqual([]);
          expect(document.globalSettings).toBeUndefined();
          expect(document.statuses.map((status: { name: string }) => status.name)).toEqual([
            "Completed",
            "Verification",
            "Shipped",
          ]);
        }),
      ),
  );
});

describe("Transfer service imports", () => {
  it.effect("Serializes concurrent imports so both get distinct names", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const results = yield* Effect.all(
          [world.importJson(minimal("Alpha")), world.importJson(minimal("Alpha"))],
          {
            concurrency: "unbounded",
          },
        );

        expect(results.map((result) => result.kind)).toEqual(["imported", "imported"]);
        expect((yield* readProjects(world)).map((project) => project.Name)).toEqual([
          "Alpha",
          "Alpha (imported)",
        ]);
      }),
    ),
  );

  it.effect("Rolls back every write when a later insert fails", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.sql`CREATE TEMP TRIGGER fail_saved_search BEFORE INSERT ON SavedSearch
          BEGIN SELECT RAISE(ABORT, 'disk full'); END`;
        const before = yield* countRows(world);

        const failure = yield* Effect.flip(world.importJson(seed));

        expect(failure).toBeDefined();
        expect(world.backup.count).toBe(1);
        expect(yield* countRows(world)).toEqual(before);
      }),
    ),
  );

  it.effect("Rolls back and writes nothing when interrupted at the backup", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const reached = yield* Deferred.make<void>();
        world.backup.before = Effect.andThen(Deferred.succeed(reached, undefined), Effect.never);
        const before = yield* countRows(world);

        const fiber = yield* Effect.forkChild(world.importJson(seed));
        yield* Deferred.await(reached);
        yield* Fiber.interrupt(fiber);

        expect(yield* countRows(world)).toEqual(before);
      }),
    ),
  );

  it.effect("Records no undo step and keeps the previous one", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const undo = yield* UndoService;
        yield* Effect.provide(
          Effect.gen(function* () {
            const projects = yield* ProjectService;
            yield* projects.create("Existing");
          }),
          ProjectService.layer("UTC"),
        );
        const before = yield* undo.status();

        const result = yield* world.importJson(minimal("Imported"));

        expect(result.kind).toBe("imported");
        expect(yield* undo.status()).toEqual(before);
        expect(before.undo).toBe("Create 'Existing'");
      }),
    ),
  );

  it.effect("Revalidates on confirmation: a file changed after the preview is checked again", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const path = join(world.folder, "changing.json");
        writeFileSync(path, minimal("First"));
        const token = yield* world.grant(path, "read");
        const transfer = yield* TransferService;

        const preview = yield* transfer.previewJsonImport(token);
        writeFileSync(path, '{"format":"task-tracker","version":9}');
        const result = yield* transfer.importJson(token);

        expect(preview).toMatchObject({
          fileName: "changing.json",
          issues: [],
          summary: { projects: 1 },
        });
        expect(result).toMatchObject({ kind: "refused", issues: [{ path: "$.version" }] });
        expect(world.backup.count).toBe(0);
      }),
    ),
  );
});

describe("Transfer file grants", () => {
  it.effect("Refuses a token main never granted, and a write token after one export", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const transfer = yield* TransferService;
        const token = yield* world.grant(join(world.folder, "once.json"), "write");
        yield* TestClock.adjust("10 seconds");

        yield* transfer.exportJson({ kind: "all" }, token);
        const reused = yield* Effect.flip(
          Effect.forkChild(transfer.exportJson({ kind: "all" }, token)).pipe(
            Effect.tap(() => TestClock.adjust("6 seconds")),
            Effect.flatMap(Fiber.join),
          ),
        );
        const read = yield* Effect.flip(
          Effect.forkChild(transfer.previewJsonImport(token)).pipe(
            Effect.tap(() => TestClock.adjust("6 seconds")),
            Effect.flatMap(Fiber.join),
          ),
        );

        expect(reused.message).toBe(
          "Choose the file again in Task Tracker; this file choice is no longer valid.",
        );
        expect(read.message).toBe(reused.message);
      }),
    ),
  );

  it.effect("Refuses a CSV file for a JSON operation and a JSON file for a CSV operation", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const transfer = yield* TransferService;
        const project = yield* createProject(world, "Target");
        const csvFile = join(world.folder, "items.csv");
        writeFileSync(csvFile, "Title\r\nOne\r\n");
        const jsonToken = yield* world.grant(csvFile, "read");
        const csvToken = yield* world.grant(join(world.folder, "out.json"), "write");
        const refused = (operation: Effect.Effect<unknown, Error>) =>
          Effect.flip(
            Effect.forkChild(operation).pipe(
              Effect.tap(() => TestClock.adjust("6 seconds")),
              Effect.flatMap(Fiber.join),
            ),
          );

        const json = yield* refused(transfer.previewJsonImport(jsonToken));
        const csv = yield* refused(transfer.exportProjectCsv(project, csvToken));

        expect(json.message).toBe(
          "Choose the file again in Task Tracker; this file choice is no longer valid.",
        );
        expect(csv.message).toBe(json.message);
      }),
    ),
  );

  it.effect("Grants only absolute .json and .csv paths", () =>
    Effect.sync(() => {
      const accepted = ["/tmp/a.json", "/tmp/b.CSV"].map(isTransferPath);
      const refused = ["relative.csv", "/tmp/c.txt", "/tmp/d.csv\0.json", "/tmp/e.csvx"].map(
        isTransferPath,
      );

      expect(accepted).toEqual([true, true]);
      expect(refused).toEqual([false, false, false, false]);
    }),
  );

  it.effect(
    "Waits briefly for a grant written just before the request and ignores invalid paths",
    () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const grants = yield* TransferFileGrants;
          const transfer = yield* TransferService;
          const path = join(world.folder, "late.json");
          writeFileSync(path, minimal("Late"));
          const token = "A".repeat(43);

          const fiber = yield* Effect.forkChild(transfer.previewJsonImport(token));
          yield* grants.grant({
            type: "transfer-file-grant",
            token: "B".repeat(43),
            path: "relative.json",
            access: "read",
          });
          yield* grants.grant({ type: "transfer-file-grant", token, path, access: "read" });
          const preview = yield* Fiber.join(fiber);

          expect(preview.summary.projects).toBe(1);
        }),
      ),
  );
});

describe("Pre-import backups", () => {
  it.effect(
    "Copies the database into the import pool, keeping five and never touching migration backups",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const folder = yield* Effect.acquireRelease(
            Effect.sync(() => mkdtempSync(join(tmpdir(), "tasktracker-import-backup-"))),
            (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
          );
          const database = join(folder, "tasktracker.db");
          copyFileSync(fixturePath("legacy-source.db"), database);
          yield* TestClock.setTime(startedAt.epochMilliseconds);
          const services = TransferService.layerWithNewline("\n").pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                UndoService.layer,
                SearchService.layer,
                TransferFileGrants.layer,
                DatabaseBackup.layer(database),
              ),
            ),
            Layer.provideMerge(databaseLayer(database)),
          );

          const paths = yield* Effect.gen(function* () {
            const transfer = yield* TransferService;
            const grants = yield* TransferFileGrants;
            const file = join(folder, "in.json");
            writeFileSync(file, minimal("Copy"));
            const backups: string[] = [];
            for (let index = 0; index < 7; index++) {
              const token = `${index}`.padStart(43, "T");
              yield* grants.grant({
                type: "transfer-file-grant",
                token,
                path: file,
                access: "read",
              });
              const result = yield* transfer.importJson(token);
              backups.push(result.kind === "imported" ? result.backupPath : "");
              yield* TestClock.adjust("1 minute");
            }
            return backups;
          }).pipe(Effect.provide(services));

          const files = readdirSync(folder).toSorted();
          expect(paths[0]).toMatch(/[/\\]tasktracker-import-20261113120000000+\.db\.bak$/);
          expect(files.filter((name) => name.startsWith("tasktracker-import-"))).toHaveLength(5);
          expect(files.filter((name) => /^tasktracker-\d+\.db\.bak$/.test(name))).toHaveLength(1);
        }),
      ),
  );
});
