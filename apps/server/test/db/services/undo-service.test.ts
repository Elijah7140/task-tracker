import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { databaseLayer } from "../../../src/db/database-layer.js";
import { FieldService } from "../../../src/services/field-service.js";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { readItems, withSchema } from "./fixtures.js";

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  FieldService.layer,
  FolderService.layer,
  ItemService.layer("UTC"),
);
const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
  const projects = yield* ProjectService;
  const folders = yield* FolderService;
  const items = yield* ItemService;
  const undo = yield* UndoService;
  const sql = yield* SqlClient.SqlClient;
  const project = yield* projects.create("Project");
  const root = (title: string) => items.create(project.id, null, null, title);
  return { projects, folders, items, undo, sql, project, root };
});

it.effect(
  "Completing the last child records and replays the whole cascade under the child's name",
  () =>
    Effect.gen(function* () {
      const { items, undo, project, root } = yield* setup;
      const parent = yield* root("Parent");
      const child = yield* items.create(project.id, null, parent.id, "Child");

      yield* items.setCompleted(project.id, null, child.id, true);
      const completed = yield* readItems();
      const undone = yield* undo.apply("undo");
      const reopened = yield* readItems();
      yield* undo.apply("redo");

      expect(undone?.label).toBe("Complete 'Child'");
      expect(completed.every((row) => row.CompletedAtUtc !== null)).toBe(true);
      expect(reopened.every((row) => row.CompletedAtUtc === null)).toBe(true);
      expect(yield* readItems()).toEqual(completed);
    }).pipe(Effect.provide(services), withSchema),
);

it.effect("Refuses a stale cascade atomically and keeps the step available", () =>
  Effect.gen(function* () {
    const { items, undo, sql, project, root } = yield* setup;
    const parent = yield* root("Parent");
    const child = yield* items.create(project.id, null, parent.id, "Child");
    yield* items.setCompleted(project.id, null, child.id, true);
    yield* sql`UPDATE TodoItem SET Title = 'External' WHERE Id = ${parent.id}`;
    const before = yield* readItems();

    const failure = yield* Effect.flip(undo.apply("undo"));

    expect(failure.message).toBe("This item changed since; can't undo.");
    expect(yield* readItems()).toEqual(before);
    expect(yield* undo.status()).toMatchObject({ undo: "Complete 'Child'", redo: null });
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("Rolls back failed and interrupted actions without replacing the redo step", () =>
  Effect.gen(function* () {
    const { undo, sql, project, root } = yield* setup;
    yield* root("Redo me");
    yield* undo.apply("undo");
    const entered = yield* Deferred.make<void>();
    const change = Effect.gen(function* () {
      yield* undo.capture("Rename project", [{ table: "Project", where: sql`Id = ${project.id}` }]);
      yield* sql`UPDATE Project SET Name = 'Uncommitted'`;
    });

    yield* Effect.flip(undo.record(change.pipe(Effect.andThen(Effect.fail("failed")))));
    const fiber = yield* Effect.forkChild(
      undo.record(
        change.pipe(
          Effect.andThen(Deferred.succeed(entered, undefined)),
          Effect.andThen(Effect.never),
        ),
      ),
    );
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(fiber);

    expect(yield* sql`SELECT Name FROM Project`).toEqual([{ Name: "Project" }]);
    expect(yield* undo.status()).toMatchObject({
      undo: "Create 'Project'",
      redo: "Create 'Redo me'",
    });
  }).pipe(Effect.provide(services), withSchema),
);

const edit = (title: string) => ({
  title,
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: null,
  dueTime: null,
  scheduledStart: null,
  scheduledEnd: null,
});

const branch = Effect.gen(function* () {
  const world = yield* setup;
  const { project, folders, items, sql } = world;
  const area = yield* folders.create(project.id, null, "Area");
  const parent = yield* items.create(project.id, area.id, null, "Parent");
  const child = yield* items.create(project.id, area.id, parent.id, "Child");
  const snapshot = () =>
    sql.withTransaction(
      Effect.all([
        sql`SELECT * FROM Project ORDER BY Id`,
        sql`SELECT * FROM Folder ORDER BY Id`,
        sql`SELECT * FROM TodoItem ORDER BY Id`,
      ]),
    );
  return { ...world, area, parent, child, snapshot };
});

for (const kind of ["project", "folder", "item"] as const) {
  it.effect(
    `Replays ${kind} deletion and restoration as separate steps, retaining earlier batches`,
    () =>
      Effect.gen(function* () {
        const { project, area, parent, undo, projects, folders, items, snapshot } = yield* branch;
        const archived = yield* items.create(project.id, area.id, parent.id, "Already deleted");
        yield* items.delete(project.id, area.id, archived.id);
        const before = yield* snapshot();

        const target = {
          project: {
            name: project.name,
            remove: () => projects.delete(project.id),
            restore: projects.restore,
          },
          folder: {
            name: area.name,
            remove: () => folders.delete(project.id, area.id),
            restore: (id: string) => folders.restore(project.id, id),
          },
          item: {
            name: parent.title,
            remove: () => items.delete(project.id, area.id, parent.id),
            restore: (id: string) => items.restore(project.id, area.id, id),
          },
        }[kind];
        const batch = yield* target.remove();
        const deleted = yield* snapshot();
        yield* target.restore(batch);
        const restored = yield* snapshot();

        expect((yield* undo.apply("undo"))?.label).toBe(`Restore '${target.name}'`);
        expect(yield* snapshot()).toEqual(deleted);
        expect((yield* undo.apply("undo"))?.label).toBe(`Delete '${target.name}'`);
        expect(yield* snapshot()).toEqual(before);
        yield* undo.apply("redo");
        expect(yield* snapshot()).toEqual(deleted);
        yield* undo.apply("redo");
        expect(yield* snapshot()).toEqual(restored);
      }).pipe(Effect.provide(services), withSchema),
  );
}

it.effect(
  "Replays project and folder creation, renaming, moving and reordering with their action labels",
  () =>
    Effect.gen(function* () {
      const { projects, folders, project, undo, sql } = yield* setup;
      const names = () =>
        projects.list().pipe(Effect.map((rows) => rows.map(({ project }) => project.name)));
      const second = yield* projects.create("Second");

      yield* undo.apply("undo");
      expect(yield* names()).toEqual(["Project"]);
      yield* undo.apply("redo");
      expect(yield* names()).toEqual(["Project", "Second"]);
      yield* projects.reorder([second.id, project.id]);
      expect((yield* undo.apply("undo"))?.label).toBe("Reorder projects");
      expect(yield* names()).toEqual(["Project", "Second"]);
      yield* undo.apply("redo");
      expect(yield* names()).toEqual(["Second", "Project"]);

      const first = yield* folders.create(project.id, null, "First");
      const next = yield* folders.create(project.id, null, "Next");
      yield* undo.apply("undo");
      yield* undo.apply("undo");
      expect(yield* sql`SELECT Id FROM Folder`).toEqual([]);
      yield* undo.apply("redo");
      yield* undo.apply("redo");

      const rows = () => sql`SELECT Name, ParentFolderId, SortOrder FROM Folder ORDER BY Name`;
      const created = yield* rows();
      yield* folders.rename(project.id, next.id, "New");
      yield* folders.reorder(project.id, null, [next.id, first.id]);
      yield* folders.move(project.id, next.id, first.id);
      const moved = yield* rows();

      expect((yield* undo.apply("undo"))?.label).toBe("Move 'New'");
      expect((yield* undo.apply("undo"))?.label).toBe("Reorder folders");
      expect((yield* undo.apply("undo"))?.label).toBe("Rename 'New'");
      expect(yield* rows()).toEqual(created);
      yield* undo.apply("redo");
      yield* undo.apply("redo");
      yield* undo.apply("redo");
      expect(yield* rows()).toEqual(moved);
    }).pipe(Effect.provide(services), withSchema),
);

it.effect(
  "Replays item creation, indentation, outdent and cross-area moves without losing descendants",
  () =>
    Effect.gen(function* () {
      const { folders, items, project, undo, root } = yield* setup;
      const folder = yield* folders.create(project.id, null, "Area");
      const first = yield* root("First");
      const second = yield* root("Second");
      const child = yield* items.create(project.id, null, second.id, "Child");

      yield* undo.apply("undo");
      expect((yield* readItems()).map((row) => row.Id)).not.toContain(child.id);
      yield* undo.apply("redo");
      const original = yield* readItems();
      yield* items.indent(project.id, null, second.id);
      const indented = yield* readItems();
      yield* items.outdent(project.id, null, second.id);
      yield* items.move(project.id, null, second.id, first.id);
      yield* items.move(project.id, null, second.id, null);
      yield* items.moveToArea(project.id, null, folder.id, second.id);
      const moved = yield* readItems();

      for (const label of ["Move 'Second'", "Move 'Second'", "Move 'Second'", "Outdent 'Second'"]) {
        expect((yield* undo.apply("undo"))?.label).toBe(label);
      }
      expect(yield* readItems()).toEqual(indented);
      expect((yield* undo.apply("undo"))?.label).toBe("Indent 'Second'");
      expect(yield* readItems()).toEqual(original);
      for (let index = 0; index < 5; index++) {
        yield* undo.apply("redo");
      }
      expect(yield* readItems()).toEqual(moved);
    }).pipe(Effect.provide(services), withSchema),
);

it.effect("Clearing a custom value and renaming are one step, including field-only edits", () =>
  Effect.gen(function* () {
    const { root, items, undo } = yield* setup;
    const fields = yield* FieldService;
    const notes = yield* fields.create("Notes", "Text", null);
    const item = yield* root("Task");

    yield* items.edit(item.id, edit("Task"), [{ fieldDefinitionId: notes.id, textValue: "Value" }]);
    expect((yield* undo.status()).undo).toBe("Edit 'Task'");
    const before = yield* items.loadFieldValues(item.id);
    yield* items.edit(item.id, edit("Renamed"), [{ fieldDefinitionId: notes.id }]);

    expect((yield* undo.apply("undo"))?.label).toBe("Edit 'Renamed'");
    expect(yield* items.loadFieldValues(item.id)).toEqual(before);
    expect((yield* readItems())[0]?.Title).toBe("Task");
    yield* undo.apply("redo");
    expect(yield* items.loadFieldValues(item.id)).toEqual([]);
    expect((yield* readItems())[0]?.Title).toBe("Renamed");

    yield* items.edit(item.id, edit("Renamed"), [
      { fieldDefinitionId: notes.id, textValue: "Again" },
    ]);
    yield* items.edit(item.id, edit("Renamed"), [{ fieldDefinitionId: notes.id }]);
    yield* undo.apply("undo");
    expect(yield* items.loadFieldValues(item.id)).toMatchObject([{ textValue: "Again" }]);
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("Refuses to resurrect a removed choice and rolls back the other row writes", () =>
  Effect.gen(function* () {
    const { root, items, undo, sql } = yield* setup;
    const fields = yield* FieldService;
    const status = yield* fields.create("Status", "Choice", null);
    const choice = yield* fields.addChoice(status.id, "Ready");
    const item = yield* root("Task");
    yield* items.edit(item.id, edit("Task"), [
      { fieldDefinitionId: status.id, choiceId: choice.id },
    ]);
    yield* items.edit(item.id, edit("Renamed"), [{ fieldDefinitionId: status.id }]);
    yield* sql`DELETE FROM FieldChoice WHERE Id = ${choice.id}`;
    const before = yield* readItems();

    const refusal = yield* Effect.flip(undo.apply("undo"));

    expect(refusal.message).toBe("This change references something that was removed; can't undo.");
    expect(yield* readItems()).toEqual(before);
    expect(yield* items.loadFieldValues(item.id)).toEqual([]);
    expect(yield* undo.status()).toMatchObject({ undo: "Edit 'Renamed'", redo: null });
  }).pipe(Effect.provide(services), withSchema),
);

for (const kind of ["link", "field value", "deleted child"] as const) {
  it.effect(`Refuses to remove a created item with a newer ${kind}`, () =>
    Effect.gen(function* () {
      const { root, undo, sql, project } = yield* setup;
      const fields = yield* FieldService;
      const notes = yield* fields.create("Notes", "Text", null);
      const item = yield* root("Task");
      const insert = {
        link: sql`INSERT INTO ItemLink (Id, ItemId, Url, SortOrder, CreatedAtUtc)
          SELECT Id, Id, 'https://example.com', 0, CreatedAtUtc FROM TodoItem WHERE Id = ${item.id}`,
        "field value": sql`INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue)
          VALUES (${item.id}, ${notes.id}, 'New value')`,
        "deleted child": sql`INSERT INTO TodoItem (Id, ProjectId, ParentItemId, Title, SortOrder,
          CreatedAtUtc, UpdatedAtUtc, DeletedAtUtc, DeletionBatchId)
          SELECT ${project.id}, ProjectId, Id, 'Deleted child', 0, CreatedAtUtc,
          UpdatedAtUtc, CreatedAtUtc, ProjectId FROM TodoItem WHERE Id = ${item.id}`,
      }[kind];
      yield* insert;

      const refusal = yield* Effect.flip(undo.apply("undo"));

      expect(refusal.message).toBe(
        "Other data still depends on this item; can't undo its removal.",
      );
      expect(yield* undo.status()).toMatchObject({ undo: "Create 'Task'", redo: null });
    }).pipe(Effect.provide(services), withSchema),
  );
}

for (const kind of ["project", "folder", "item"] as const) {
  it.effect(`Refuses to reactivate a row beneath a deleted ${kind}`, () =>
    Effect.gen(function* () {
      const { area, project, parent, child, items, folders, undo, sql, snapshot } = yield* branch;
      if (kind === "project") {
        yield* folders.delete(project.id, area.id);
        yield* sql`UPDATE Project SET DeletedAtUtc = CreatedAtUtc, DeletionBatchId = Id`;
      } else {
        yield* items.delete(project.id, area.id, child.id);
        if (kind === "folder") {
          yield* sql`UPDATE Folder SET DeletedAtUtc = CreatedAtUtc, DeletionBatchId = Id`;
        } else {
          yield* sql`UPDATE TodoItem SET DeletedAtUtc = CreatedAtUtc, DeletionBatchId = Id WHERE Id = ${parent.id}`;
        }
      }
      const before = yield* snapshot();

      const failure = yield* Effect.flip(undo.apply("undo"));

      expect(failure.message).toBe(
        {
          project: "Restore the project first",
          folder: "Restore the folder 'Area' first",
          item: "Restore the item 'Parent' first",
        }[kind],
      );
      expect(yield* snapshot()).toEqual(before);
    }).pipe(Effect.provide(services), withSchema),
  );
}

it.effect("Refuses to redo a folder deletion with newer active contents", () =>
  Effect.gen(function* () {
    const { folders, project, sql, undo } = yield* setup;
    const folder = yield* folders.create(project.id, null, "Area");
    yield* folders.delete(project.id, folder.id);
    yield* undo.apply("undo");
    yield* sql`INSERT INTO TodoItem (Id, ProjectId, FolderId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc)
      SELECT Id, ProjectId, Id, 'Imported', 0, CreatedAtUtc, UpdatedAtUtc FROM Folder WHERE Id = ${folder.id}`;

    const refusal = yield* Effect.flip(undo.apply("redo"));

    expect(refusal.message).toContain("new contents");
    expect(yield* undo.status()).toMatchObject({ redo: "Delete 'Area'" });
    expect((yield* folders.create(project.id, folder.id, "Nested")).parentFolderId).toBe(folder.id);
  }).pipe(Effect.provide(services), withSchema),
);

for (const direction of ["undo", "redo"] as const) {
  it.effect(`Refuses ${direction} after a purge and leaves the history cursor in place`, () =>
    Effect.gen(function* () {
      const { items, project, root, sql, undo } = yield* setup;
      const item = yield* root("Gone");
      const batch = yield* items.delete(project.id, null, item.id);
      if (direction === "redo") {
        yield* items.restore(project.id, null, batch);
        yield* undo.apply("undo");
      }
      const before = yield* undo.status();
      yield* sql`DELETE FROM TodoItem WHERE DeletionBatchId = ${batch}`;

      const refusal = yield* Effect.flip(undo.apply(direction));

      expect(refusal.message).toBe(`This item was permanently deleted since; can't ${direction}.`);
      expect(yield* undo.status()).toEqual(before);
      expect(yield* readItems()).toEqual([]);
    }).pipe(Effect.provide(services), withSchema),
  );
}

it.effect(
  "Ignores no-op and timestamp-only writes, and ignores unrelated changes during replay",
  () =>
    Effect.gen(function* () {
      const { items, project, root, sql, undo } = yield* setup;
      const first = yield* root("First");
      const second = yield* root("Second");
      const third = yield* root("Third");
      const before = yield* undo.status();
      yield* TestClock.adjust("5 minutes");

      yield* items.edit(first.id, edit("First"));
      yield* items.reorder(project.id, null, null, [first.id, second.id, third.id]);
      expect(yield* undo.status()).toEqual(before);

      yield* items.reorder(project.id, null, null, [second.id, first.id, third.id]);
      yield* sql`UPDATE TodoItem SET Title = 'Unrelated' WHERE Id = ${third.id}`;
      yield* sql`UPDATE TodoItem SET UpdatedAtUtc = '2026-11-14 12:00:00' WHERE Id = ${first.id}`;
      expect((yield* undo.apply("undo"))?.label).toBe("Reorder items");
      const area = yield* items.loadArea(project.id, null);
      expect(area.items.open.map(({ item }) => item.title)).toEqual([
        "First",
        "Second",
        "Unrelated",
      ]);
    }).pipe(Effect.provide(services), withSchema),
);

it.effect("Preserves redo on a refused step and drops it after a new successful action", () =>
  Effect.gen(function* () {
    const { root, items, sql, undo } = yield* setup;
    const item = yield* root("Task");
    yield* items.edit(item.id, edit("Edited"));
    yield* undo.apply("undo");
    yield* sql`UPDATE TodoItem SET Title = 'External' WHERE Id = ${item.id}`;

    const refusal = yield* Effect.flip(undo.apply("redo"));

    expect(refusal.message).toBe("This item changed since; can't redo.");
    expect((yield* undo.status()).redo).toBe("Edit 'Edited'");
    yield* items.edit(item.id, edit("Different"));
    expect(yield* undo.status()).toMatchObject({ undo: "Edit 'Different'", redo: null });
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("Keeps the full rolling capacity and serializes concurrent undo requests", () =>
  Effect.gen(function* () {
    const { root, undo } = yield* setup;
    yield* Effect.forEach(
      Array.from({ length: 51 }, (_, index) => index + 1),
      (index) => root(`Task ${index}`),
    );

    const actions = yield* Effect.forEach(Array.from({ length: 51 }), () => undo.apply("undo"), {
      concurrency: "unbounded",
    });

    expect(new Set(actions.flatMap((action) => (action === null ? [] : [action.label]))).size).toBe(
      50,
    );
    expect((yield* readItems()).map((row) => row.Title)).toEqual(["Task 1"]);
    expect(yield* undo.status()).toMatchObject({ undo: null, redo: "Create 'Task 2'" });
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("Serializes recording with undo from transaction start through commit", () =>
  Effect.gen(function* () {
    const { undo, sql, project } = yield* setup;
    const entered = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const writer = yield* Effect.forkChild(
      undo.record(
        Effect.gen(function* () {
          yield* undo.capture("Rename 'Concurrent'", [
            { table: "Project", where: sql`Id = ${project.id}` },
          ]);
          yield* sql`UPDATE Project SET Name = 'Concurrent'`;
          yield* Deferred.succeed(entered, undefined);
          yield* Deferred.await(finish);
        }),
      ),
    );
    yield* Deferred.await(entered);

    const reader = yield* Effect.forkChild(undo.apply("undo"));
    yield* Deferred.succeed(finish, undefined);
    yield* Fiber.join(writer);
    const undone = yield* Fiber.join(reader);

    expect(undone?.label).toBe("Rename 'Concurrent'");
    expect(yield* sql`SELECT Name FROM Project`).toEqual([{ Name: "Project" }]);
    expect(yield* undo.status()).toMatchObject({
      undo: "Create 'Project'",
      redo: "Rename 'Concurrent'",
    });
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("Replays FTS changes and preserves reminder delivery markers", () =>
  Effect.gen(function* () {
    const { undo, items, root, sql } = yield* setup;
    const item = yield* root("Original");
    const search = (text: string) =>
      sql`SELECT Title FROM TodoItemSearch WHERE TodoItemSearch MATCH ${text}`;
    yield* undo.apply("undo");
    expect(yield* search("Original")).toEqual([]);
    yield* undo.apply("redo");
    expect(yield* search("Original")).toEqual([{ Title: "Original" }]);
    yield* items.edit(item.id, edit("Renamed"));
    yield* sql`UPDATE TodoItem SET ReminderDeliveredFor = 639325734000000000 WHERE Id = ${item.id}`;

    yield* undo.apply("undo");

    expect(yield* search("Original")).toEqual([{ Title: "Original" }]);
    expect(yield* search("Renamed")).toEqual([]);
    expect(yield* sql`SELECT CAST(ReminderDeliveredFor AS TEXT) AS Marker FROM TodoItem`).toEqual([
      { Marker: "639325734000000000" },
    ]);
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("Reports a refused completion preview without publishing a history step", () =>
  Effect.gen(function* () {
    const { items, project, root, undo } = yield* setup;
    const parent = yield* root("Parent");
    const child = yield* items.create(project.id, null, parent.id, "Child");
    const initial = yield* undo.status();

    const preview = yield* items.setCompleted(project.id, null, parent.id, true);

    expect(preview.kind).toBe("needs-confirmation");
    expect(yield* undo.status()).toEqual(initial);
    yield* items.setCompleted(project.id, null, child.id, true);
    const completed = yield* readItems();
    yield* items.setCompleted(project.id, null, child.id, false);
    expect((yield* readItems()).every((row) => row.CompletedAtUtc === null)).toBe(true);
    expect((yield* undo.apply("undo"))?.label).toBe("Reopen 'Child'");
    expect(yield* readItems()).toEqual(completed);
    yield* undo.apply("redo");
    expect((yield* readItems()).every((row) => row.CompletedAtUtc === null)).toBe(true);
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("Discards a captured step when SQLite refuses the commit", () =>
  Effect.gen(function* () {
    const { undo, sql, root } = yield* setup;
    const item = yield* root("Original");
    const before = yield* readItems();
    const status = yield* undo.status();

    const failure = yield* Effect.flip(
      undo.record(
        Effect.gen(function* () {
          yield* undo.capture("Invalid item edit", [
            { table: "TodoItem", where: sql`Id = ${item.id}` },
          ]);
          yield* sql`PRAGMA defer_foreign_keys = ON`;
          yield* sql`UPDATE TodoItem SET ParentItemId = 'missing' WHERE Id = ${item.id}`;
        }),
      ),
    );

    expect(failure.message).toContain("FOREIGN KEY");
    expect(yield* readItems()).toEqual(before);
    expect(yield* undo.status()).toEqual(status);
  }).pipe(Effect.provide(services), withSchema),
);

it.effect("A reopened database retains committed rows and starts with empty history", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "tasktracker-undo-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    );
    const path = join(directory, "reopen.db");
    const session = () =>
      services.pipe(
        Layer.provideMerge(UndoService.layer),
        Layer.provideMerge(databaseLayer(path)),
        Layer.fresh,
      );

    yield* Effect.scoped(
      Effect.gen(function* () {
        const { root, undo } = yield* setup;
        yield* root("Retained");
        yield* root("Undone");
        yield* undo.apply("undo");
        expect((yield* undo.status()).redo).toBe("Create 'Undone'");
      }).pipe(Effect.provide(session())),
    );

    yield* Effect.scoped(
      Effect.gen(function* () {
        const undo = yield* UndoService;

        expect((yield* readItems()).map((row) => row.Title)).toEqual(["Retained"]);
        expect(yield* undo.status()).toEqual({ undo: null, redo: null, revision: 0 });
        expect(yield* undo.apply("undo")).toBeNull();
        expect(yield* undo.apply("redo")).toBeNull();
      }).pipe(Effect.provide(session())),
    );
  }),
);
