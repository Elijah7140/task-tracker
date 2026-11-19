import { expect, it } from "@effect/vitest";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { Effect, Layer, Schema } from "effect";
import { databaseLayer } from "../../src/db/database-layer.js";
import { databaseMigrations } from "../../src/db/migrations/migrate.js";
import { sqliteLayer } from "../../src/db/sqlite.js";
import { Migrator, SqlClient } from "effect/sql";
import { vi } from "vitest";
import { FloatingTimestamp, Guid, TimeText, UtcTimestamp } from "../../src/db/storage-codecs.js";

const faults = vi.hoisted(() => ({ failMigration: false }));

vi.mock("node:sqlite", async (importOriginal) => {
  const native = await importOriginal<typeof import("node:sqlite")>();
  return {
    ...native,
    backup: vi.fn(native.backup),
    DatabaseSync: class extends native.DatabaseSync {
      override prepare(statement: string) {
        // Fail after the ledger and FieldDefinition have been written.
        const ddl =
          faults.failMigration && statement.startsWith('CREATE TABLE "FieldChoice"')
            ? "CREATE TABLE FieldDefinition (Sentinel TEXT)"
            : statement;
        return super.prepare(ddl);
      }
    },
  };
});

const initialId = "20261113163313_InitialCreate";
const customFieldsId = "20261114032356_AddCustomFields";
const completedLedger = [
  { migration_id: 1, name: "InitialCreate" },
  { migration_id: 2, name: "AddCustomFields" },
];
const childId = "019A0000-0000-7000-8000-000000000CCB";
const parentId = "019A0000-0000-7000-8000-000000000CCA";
const archivedTypeId = "019A0000-0000-7000-8000-000000000EEE";

function temporaryDatabase(fixture?: "initial-create" | "phase-3") {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const folder = mkdtempSync(join(tmpdir(), "tasktracker-startup-"));
      const path = join(folder, "tracker.db");
      if (fixture) {
        copyFileSync(new URL(`../fixtures/ef/${fixture}.db`, import.meta.url), path);
      }
      return { folder, path };
    }),
    ({ folder }) => Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
  );
}

const start = (path: string) => Effect.scoped(Layer.build(databaseLayer(path)));
const backups = (folder: string) =>
  readdirSync(folder).filter((name) => /^tasktracker-.*\.db\.bak$/.test(name));
function singleBackup(folder: string) {
  const [saved, ...others] = backups(folder);
  assert.ok(saved);
  expect(others).toEqual([]);
  return saved;
}

const history = (path: string) =>
  query(path, "SELECT * FROM __EFMigrationsHistory ORDER BY MigrationId");
const ledger = (path: string) =>
  query(path, "SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id");

function query(path: string, statement: string, ...parameters: SQLInputValue[]) {
  using database = new DatabaseSync(path, { readOnly: true });
  return database.prepare(statement).all(...parameters);
}

function execute(path: string, statement: string) {
  using database = new DatabaseSync(path);
  database.exec(statement);
}

function schema(path: string) {
  return query(
    path,
    `SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT IN ('__EFMigrationsHistory', '__EFMigrationsLock', 'effect_sql_migrations')
      AND name NOT LIKE 'sqlite_autoindex___EFMigrations%'
    ORDER BY name`,
  );
}

function snapshot(path: string) {
  return query(
    path,
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'effect_sql_migrations'",
  ).map(({ name }) => [name, query(path, `SELECT * FROM "${String(name)}"`)] as const);
}

it.effect("Migrates a new file without backup and opens it again without reseeding", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase();

    yield* start(path);
    yield* start(path);

    expect(ledger(path)).toEqual(completedLedger);
    expect(backups(folder)).toEqual([]);
    expect(query(path, "SELECT count(*) AS count FROM ItemType")).toEqual([{ count: 3 }]);
    expect(query(path, "SELECT count(*) AS count FROM PriorityLevel")).toEqual([{ count: 4 }]);
  }),
);

it.effect("Backs up an existing empty file before creating its schema", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase();
    writeFileSync(path, "");

    yield* start(path);

    const saved = singleBackup(folder);
    expect(saved).toMatch(/^tasktracker-\d{21}\.db\.bak$/);
    expect(query(join(folder, saved), "SELECT name FROM sqlite_schema")).toEqual([]);
    expect(ledger(path)).toEqual(completedLedger);
  }),
);

it.effect("Keeps the latest five backups including legacy backup names", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase();
    writeFileSync(path, "");
    const oldNames = Array.from(
      { length: 6 },
      (_, index) => `tasktracker-2020010100000${index}0000000.db.bak`,
    );
    for (const name of oldNames) {
      writeFileSync(join(folder, name), "old");
    }

    yield* start(path);

    expect(backups(folder)).toHaveLength(5);
    expect(backups(folder)).toEqual(
      expect.arrayContaining(["tasktracker-197001010000000000000.db.bak", ...oldNames.slice(2)]),
    );
  }),
);

it.effect("Includes committed WAL data in the pre-adoption backup", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase("phase-3");
    using writer = new DatabaseSync(path);
    writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
    writer.exec("UPDATE Project SET Name = 'Only in WAL'");

    yield* start(path);

    const saved = singleBackup(folder);
    expect(query(join(folder, saved), "SELECT Name FROM Project")).toEqual([
      { Name: "Only in WAL" },
    ]);
    expect(
      query(
        join(folder, saved),
        "SELECT name FROM sqlite_schema WHERE name = 'effect_sql_migrations'",
      ),
    ).toEqual([]);
  }),
);

it.effect("Adopts the initial EF migration, adds custom fields, and reopens in place", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase("initial-create");
    const before = snapshot(path);

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
                   VALUES (${"019A0000-0000-7000-8000-00000000F001"}, 'metadata', 'Metadata', 'Text', 0, 0)`;
          yield* sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue)
                   VALUES (${childId}, ${"019A0000-0000-7000-8000-00000000F001"}, 'attached')`;
        }),
      );
    }).pipe(Effect.provide(databaseLayer(path)), Effect.scoped);
    yield* start(path);

    expect(snapshot(path)).toEqual(expect.arrayContaining(before));
    expect(
      query(path, "SELECT Id, ParentItemId, FolderId FROM TodoItem WHERE Id = ?", childId),
    ).toEqual([
      { Id: childId, ParentItemId: parentId, FolderId: "019A0000-0000-7000-8000-000000000BBC" },
    ]);
    expect(query(path, "SELECT TextValue FROM ItemFieldValue")).toEqual([
      { TextValue: "attached" },
    ]);
    expect(history(path).map((row) => row.MigrationId)).toEqual([initialId]);
    expect(ledger(path)).toEqual(completedLedger);
    expect(snapshot(join(folder, singleBackup(folder)))).toEqual(before);
  }),
);

it.effect("Baselines Phase 3 and retains the EF schema, storage values and user changes", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase("phase-3");
    const fresh = yield* temporaryDatabase();
    const before = snapshot(path);
    const originalSchema = schema(path);

    yield* start(path);
    yield* start(path);
    yield* start(fresh.path);

    expect(snapshot(path)).toEqual(before);
    expect(schema(path)).toEqual(originalSchema);
    expect(schema(fresh.path)).toEqual(originalSchema);
    expect(query(path, "SELECT Name FROM Project")).toEqual([{ Name: "Sample project" }]);
    expect(history(path).map((row) => row.MigrationId)).toEqual([initialId, customFieldsId]);
    expect(ledger(path)).toEqual(completedLedger);
    expect(snapshot(join(folder, singleBackup(folder)))).toEqual(before);

    expect(query(path, "SELECT Id, Name, IsArchived FROM ItemType ORDER BY SortOrder")).toEqual([
      { Id: "019A0000-0000-7000-8000-000000000001", Name: "Renamed Change", IsArchived: 0 },
      { Id: "019A0000-0000-7000-8000-000000000002", Name: "Error", IsArchived: 0 },
      { Id: "019A0000-0000-7000-8000-000000000003", Name: "Discussion", IsArchived: 0 },
      { Id: archivedTypeId, Name: "Archived type", IsArchived: 1 },
    ]);
  }),
);

it.effect("Edits an adopted Phase 3 value through the server and reads it after reopening", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase("phase-3");
    const fieldId = "019A0000-0000-7000-8000-00000000F002";
    const encodeId = Schema.encodeSync(Guid);

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.withTransaction(
        sql`UPDATE ItemFieldValue SET NumberValue = ${16.25}
            WHERE ItemId = ${encodeId(childId.toLowerCase())}
            AND FieldDefinitionId = ${encodeId(fieldId.toLowerCase())}`,
      );
    }).pipe(Effect.provide(databaseLayer(path)), Effect.scoped);
    yield* start(path);

    const read =
      "SELECT NumberValue FROM ItemFieldValue WHERE ItemId = ? AND FieldDefinitionId = ?";
    expect(query(path, read, childId, fieldId)).toEqual([{ NumberValue: 16.25 }]);
    expect(query(join(folder, singleBackup(folder)), read, childId, fieldId)).toEqual([
      { NumberValue: 12.5 },
    ]);
  }),
);

it.effect("Preserves EF hierarchy, ISO settings and all five custom value encodings", () =>
  Effect.gen(function* () {
    const { path } = yield* temporaryDatabase("phase-3");

    yield* start(path);

    const [child] = query(path, "SELECT * FROM TodoItem WHERE Id = ?", childId);
    assert.ok(child);
    expect(child).toMatchObject({
      Id: childId,
      ParentItemId: parentId,
      FolderId: "019A0000-0000-7000-8000-000000000BBC",
      ItemTypeId: archivedTypeId,
      DueDate: "2026-12-10",
      DueTime: "09:30:00.1200000",
      ScheduledEnd: "2026-12-09 15:00:00.1234567",
      CompletedAtUtc: "2026-11-13 12:00:00.1234567",
    });
    expect(Schema.decodeUnknownSync(Guid)(child.Id)).toBe(child.Id);
    expect(Schema.decodeUnknownSync(UtcTimestamp)(child.CompletedAtUtc).toString()).toBe(
      "2026-11-13T12:00:00.1234567Z",
    );
    expect(Schema.decodeUnknownSync(FloatingTimestamp)(child.ScheduledStart).toString()).toBe(
      "2026-12-09T14:00:00.1234567",
    );
    expect(Schema.decodeUnknownSync(TimeText)(child.DueTime).toString()).toBe("09:30:00.12");
    expect(query(path, "SELECT Id, ParentFolderId FROM Folder ORDER BY Id")).toEqual([
      { Id: "019A0000-0000-7000-8000-000000000BBB", ParentFolderId: null },
      {
        Id: "019A0000-0000-7000-8000-000000000BBC",
        ParentFolderId: "019A0000-0000-7000-8000-000000000BBB",
      },
    ]);
    expect(
      query(
        path,
        "SELECT DeletedAtUtc, DeletionBatchId FROM TodoItem WHERE DeletedAtUtc IS NOT NULL",
      ),
    ).toEqual([
      {
        DeletedAtUtc: "2026-11-13 12:00:00.1234567",
        DeletionBatchId: "019A0000-0000-7000-8000-000000000DDD",
      },
    ]);
    expect(
      query(path, "SELECT Value FROM GlobalSetting UNION ALL SELECT Value FROM ProjectSetting"),
    ).toEqual(expect.arrayContaining([{ Value: "P1D" }, { Value: "PT3H" }, { Value: "PT0.5S" }]));
    expect(
      query(
        path,
        `SELECT DataType, IsArchived, TextValue, NumberValue, typeof(NumberValue) AS NumberStorage,
      DateValue, BoolValue, ChoiceId FROM ItemFieldValue JOIN FieldDefinition ON FieldDefinitionId = Id ORDER BY SortOrder`,
      ),
    ).toMatchObject([
      { DataType: "Text", IsArchived: 1, TextValue: "Example text" },
      { DataType: "Number", IsArchived: 0, NumberValue: 12.5, NumberStorage: "real" },
      { DataType: "Date", IsArchived: 0, DateValue: "2026-12-08" },
      { DataType: "Boolean", IsArchived: 0, BoolValue: 0 },
      { DataType: "Choice", IsArchived: 0, ChoiceId: "019A0000-0000-7000-8000-00000000FAAA" },
    ]);
    expect(query(path, "SELECT Id, IsArchived FROM FieldChoice")).toEqual([
      { Id: "019A0000-0000-7000-8000-00000000FAAA", IsArchived: 1 },
    ]);
    expect(() =>
      execute(path, "UPDATE TodoItem SET DueDate = NULL WHERE DueTime IS NOT NULL"),
    ).toThrow("CK_TodoItem_DueTime");
    expect(() =>
      execute(path, "UPDATE TodoItem SET ScheduledStart = NULL WHERE ScheduledEnd IS NOT NULL"),
    ).toThrow("CK_TodoItem_ScheduledEnd");
    expect(() =>
      execute(path, "UPDATE ItemFieldValue SET TextValue = 'Invalid' WHERE BoolValue IS NOT NULL"),
    ).toThrow("CK_ItemFieldValue_ExactlyOne");
    expect(() =>
      execute(path, "UPDATE ItemFieldValue SET ChoiceId = 'unknown' WHERE ChoiceId IS NOT NULL"),
    ).toThrow("FOREIGN KEY");
  }),
);

it.effect.each([
  ["unrecognized history", "UPDATE __EFMigrationsHistory SET MigrationId = 'future'"],
  ["missing index", "DROP INDEX IX_TodoItem_ProjectId_FolderId"],
  [
    "different index with the same name",
    "DROP INDEX IX_TodoItem_DueDate; CREATE INDEX IX_TodoItem_DueDate ON TodoItem(Title)",
  ],
  [
    "history for a different stage",
    `INSERT INTO __EFMigrationsHistory VALUES ('${customFieldsId}', '10.0.15')`,
  ],
  ["unrecognized object", "CREATE TABLE Unrelated (Id INTEGER)"],
] as const)("Refuses an EF file with %s before writing a backup or ledger", ([, damage]) =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase("initial-create");
    execute(path, damage);
    const before = snapshot(path);

    const failure = yield* Effect.flip(start(path));

    expect(failure).toMatchObject({
      message: expect.stringContaining("Unrecognized Task Tracker database schema"),
    });
    expect(snapshot(path)).toEqual(before);
    expect(backups(folder)).toEqual([]);
  }),
);

it.effect("Stops before adoption when the SQLite backup fails", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase("initial-create");
    const before = snapshot(path);
    vi.mocked(backup).mockImplementationOnce((_source, target) => {
      writeFileSync(target, "partial backup");
      return Promise.reject(new Error("Backup destination unavailable"));
    });

    const failure = yield* Effect.flip(start(path));

    expect(failure).toMatchObject({
      message: expect.stringContaining("Backup destination unavailable"),
    });
    expect(snapshot(path)).toEqual(before);
    expect(readdirSync(folder).filter((name) => name.startsWith("tasktracker-"))).toEqual([]);
  }),
);

it.effect("Backs up a pending Effect migration before applying it", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase();
    yield* Migrator.make({})({
      loader: Effect.map(databaseMigrations, (migrations) => migrations.slice(0, 1)),
    }).pipe(Effect.provide(sqliteLayer(path)), Effect.scoped);
    const before = ledger(path);

    yield* start(path);
    yield* start(path);

    expect(ledger(join(folder, singleBackup(folder)))).toEqual(before);
    expect(ledger(path)).toEqual(completedLedger);
  }),
);

it.effect("Refuses a nonempty schema without a recognized migration ledger", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase();
    execute(path, "CREATE TABLE Unrelated (Id INTEGER)");

    const failure = yield* Effect.flip(start(path));

    expect(failure.message).toContain('Unexpected or altered schema object "Unrelated"');
    expect(snapshot(path)).toEqual([["Unrelated", []]]);
    expect(backups(folder)).toEqual([]);
  }),
);

it.effect("Rolls back adoption and partial schema changes when the additive migration fails", () =>
  Effect.gen(function* () {
    const { path, folder } = yield* temporaryDatabase("initial-create");
    const before = snapshot(path);
    const originalSchema = schema(path);
    faults.failMigration = true;

    const failure = yield* Effect.flip(start(path)).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          faults.failMigration = false;
        }),
      ),
    );

    expect(failure.message).toContain('Migration "2_AddCustomFields" failed');
    const saved = singleBackup(folder);
    expect(snapshot(join(folder, saved))).toEqual(before);
    expect(snapshot(path)).toEqual(before);
    expect(schema(path)).toEqual(originalSchema);
    expect(
      query(path, "SELECT name FROM sqlite_schema WHERE name = 'effect_sql_migrations'"),
    ).toEqual([]);

    yield* start(path);

    expect(ledger(path)).toEqual(completedLedger);
    expect(backups(folder)).toHaveLength(2);
    expect(backups(folder)).toContain(saved);
  }),
);
