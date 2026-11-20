import { randomBytes } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, type Scope } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { databaseLayer } from "../../../../src/db/database-layer.js";
import { migrate } from "../../../../src/db/migrations/migrate.js";
import { sqliteLayer } from "../../../../src/db/sqlite.js";
import { DatabaseBackup } from "../../../../src/services/transfer/database-backup.js";
import { TransferFileError } from "../../../../src/services/transfer/transfer-file-error.js";
import { TransferFileGrants } from "../../../../src/services/transfer/transfer-file-grants.js";
import {
  type ExportScope,
  type ImportResult,
  TransferService,
} from "../../../../src/services/transfer/transfer-service.js";
import type {
  CsvImportPreview,
  ItemQuery,
  TransferIssue,
  TransferSummary,
} from "@task-tracker/core";
import { SearchService } from "../../../../src/services/search-service.js";
import { UndoService } from "../../../../src/services/undo-service.js";

/** The fixtures generated with legacy-final (see the folder's README). */
export const fixturePath = (name: string) =>
  new URL(`../../../fixtures/transfer/${name}`, import.meta.url).pathname;

/** A legacy fixture's text. */
export const fixtureText = (name: string) => readFileSync(fixturePath(name), "utf8");

/** The instant at which transfer tests start, the legacy test clock's start. */
export const startedAt = Temporal.Instant.from("2026-11-13T12:00:00Z");

/** A backup double that counts copies and can fail like a full disk. */
export interface RecordingBackup {
  count: number;
  fail: boolean;
  /** Runs before each copy, so a test can hold an import at its backup. */
  before: Effect.Effect<void>;
}

/** A checked import file. */
export interface ImportPreview {
  readonly fileName: string;
  readonly summary: TransferSummary;
  readonly issues: readonly TransferIssue[];
}

/** One database with the transfer service, a temporary folder for files and a recording backup. */
export interface TransferWorld {
  readonly sql: SqlClient.SqlClient;
  readonly backup: RecordingBackup;
  readonly folder: string;
  /** Exports through a write grant and returns the file's text. */
  readonly exportJson: (scope?: ExportScope) => Effect.Effect<string, Error>;
  /** Writes `text` to a file, grants it and imports it. */
  readonly importJson: (text: string) => Effect.Effect<ImportResult, Error>;
  /** Writes `text` to a file, grants it and checks it. */
  readonly previewJson: (text: string) => Effect.Effect<ImportPreview, Error>;
  /** Grants a path and returns its token. */
  readonly grant: (path: string, access: "read" | "write") => Effect.Effect<string>;
  /** Exports a project as CSV through a write grant and returns the file's bytes. */
  readonly exportProjectCsvBytes: (projectId: string) => Effect.Effect<Buffer, Error>;
  /** Exports a project as CSV and returns the file's text, byte order mark included. */
  readonly exportProjectCsv: (projectId: string) => Effect.Effect<string, Error>;
  /** Exports every match of a search as CSV and returns the file's bytes and the count. */
  readonly exportSearchCsv: (
    query: ItemQuery,
  ) => Effect.Effect<{ readonly bytes: Buffer; readonly count: number }, Error>;
  /** Writes `content` to a `.csv` file, grants it and previews it against the target. */
  readonly previewCsv: (
    content: string | Uint8Array,
    projectId: string,
    folderId?: string | null,
  ) => Effect.Effect<CsvImportPreview & { readonly fileName: string }, Error>;
  /** Writes `content` to a `.csv` file, grants it and imports it into the target. */
  readonly importCsv: (
    content: string | Uint8Array,
    projectId: string,
    folderId?: string | null,
  ) => Effect.Effect<ImportResult, Error>;
}

const newToken = () => randomBytes(32).toString("base64url");

const recordingBackup = (state: RecordingBackup) =>
  Layer.succeed(DatabaseBackup, {
    createImportBackup: Effect.suspend(() => state.before).pipe(
      Effect.andThen(
        Effect.suspend(() => {
          if (state.fail) {
            const message =
              "The database backup could not be made, so nothing was imported: The disk is full.";
            return Effect.fail(new TransferFileError(message));
          }
          state.count++;
          return Effect.succeed(`backup-${state.count}.db.bak`);
        }),
      ),
    ),
  });

const makeWorld = (folder: string, backup: RecordingBackup) =>
  Effect.gen(function* () {
    const transfer = yield* TransferService;
    const grants = yield* TransferFileGrants;
    const sql = yield* SqlClient.SqlClient;
    let files = 0;
    const grantPath = (path: string, access: "read" | "write") =>
      Effect.gen(function* () {
        const token = newToken();
        yield* grants.grant({ type: "transfer-file-grant", token, path, access });
        return token;
      });
    const fileWith = (text: string | Uint8Array, extension = "json") => {
      const path = join(folder, `import-${files++}.${extension}`);
      writeFileSync(path, text);
      return path;
    };
    const exportCsvTo = <A>(write: (token: string) => Effect.Effect<A, unknown>) =>
      Effect.gen(function* () {
        const path = join(folder, `export-${files++}.csv`);
        const result = yield* write(yield* grantPath(path, "write"));
        return { bytes: readFileSync(path), result };
      }) as Effect.Effect<{ bytes: Buffer; result: A }, Error>;
    const csvTarget = (projectId: string, folderId: string | null = null) => ({
      projectId,
      folderId,
    });
    const world: TransferWorld = {
      sql,
      backup,
      folder,
      grant: grantPath,
      exportJson: (scope = { kind: "all" }) =>
        Effect.gen(function* () {
          const path = join(folder, `export-${files++}.json`);
          yield* transfer.exportJson(scope, yield* grantPath(path, "write"));
          return readFileSync(path, "utf8");
        }) as Effect.Effect<string, Error>,
      importJson: (text) => Effect.flatMap(grantPath(fileWith(text), "read"), transfer.importJson),
      exportProjectCsvBytes: (projectId) =>
        Effect.map(
          exportCsvTo((token) => transfer.exportProjectCsv(projectId, token)),
          ({ bytes }) => bytes,
        ),
      exportProjectCsv: (projectId) =>
        Effect.map(
          exportCsvTo((token) => transfer.exportProjectCsv(projectId, token)),
          ({ bytes }) => bytes.toString("utf8"),
        ),
      exportSearchCsv: (query) =>
        Effect.map(
          exportCsvTo((token) => transfer.exportSearchResultsCsv(query, token)),
          ({ bytes, result }) => ({ bytes, count: result.count }),
        ),
      previewCsv: (content, projectId, folderId) =>
        Effect.flatMap(grantPath(fileWith(content, "csv"), "read"), (token) =>
          transfer.previewCsvImport(token, csvTarget(projectId, folderId)),
        ) as Effect.Effect<CsvImportPreview & { readonly fileName: string }, Error>,
      importCsv: (content, projectId, folderId) =>
        Effect.flatMap(grantPath(fileWith(content, "csv"), "read"), (token) =>
          transfer.importCsv(token, csvTarget(projectId, folderId)),
        ) as Effect.Effect<ImportResult, Error>,
      previewJson: (text) =>
        Effect.flatMap(
          grantPath(fileWith(text), "read"),
          transfer.previewJsonImport,
        ) as Effect.Effect<ImportPreview, Error>,
    };
    return world;
  });

type WorldServices =
  | SqlClient.SqlClient
  | UndoService
  | SearchService
  | Scope.Scope
  | TransferService
  | TransferFileGrants;
type WorldTest<A, E> = (world: TransferWorld) => Effect.Effect<A, E, WorldServices>;

function services(database: Layer.Layer<SqlClient.SqlClient, unknown>, backup: RecordingBackup) {
  const base = Layer.mergeAll(
    UndoService.layer,
    SearchService.layer,
    TransferFileGrants.layer,
    recordingBackup(backup),
  ).pipe(Layer.provideMerge(database));
  return TransferService.layerWithNewline("\n").pipe(Layer.provideMerge(base));
}

const temporaryFolder = Effect.acquireRelease(
  Effect.sync(() => mkdtempSync(join(tmpdir(), "tasktracker-transfer-"))),
  (folder) => Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
);

function runWorld<A, E>(
  database: (folder: string) => Layer.Layer<SqlClient.SqlClient, unknown>,
  test: WorldTest<A, E>,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(startedAt.epochMilliseconds);
      const folder = yield* temporaryFolder;
      const backup: RecordingBackup = { count: 0, fail: false, before: Effect.void };
      return yield* Effect.gen(function* () {
        return yield* test(yield* makeWorld(folder, backup));
      }).pipe(Effect.provide(services(database(folder), backup)));
    }),
  );
}

const freshDatabase = Layer.effectDiscard(migrate).pipe(
  Layer.provideMerge(sqliteLayer(":memory:")),
);

/** Runs a test against a fresh, migrated in-memory database. */
export const emptyWorld = <A, E>(test: WorldTest<A, E>) => runWorld(() => freshDatabase, test);

/**
 * Runs a test against a disposable copy of the legacy database the fixtures were
 * exported from: every field type, folders, sub-items, trash, statuses, repeats,
 * reminders, links and saved searches.
 */
export const seededWorld = <A, E>(test: WorldTest<A, E>) =>
  runWorld((folder) => {
    const path = join(folder, "tasktracker.db");
    copyFileSync(fixturePath("legacy-source.db"), path);
    return databaseLayer(path);
  }, test);

/** Reads rows through a fresh transaction. */
export const readRows = <Row extends object>(
  world: TransferWorld,
  query: string,
  ...params: unknown[]
) => world.sql.withTransaction(world.sql.unsafe<Row>(query, params));
