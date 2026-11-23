import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { CalendarService } from "../../../src/services/calendar-service.js";
import { FieldService } from "../../../src/services/field-service.js";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { TrashService } from "../../../src/services/trash-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { readItems, setAutoComplete, withSchema } from "./fixtures.js";

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  FolderService.layer,
  ItemService.layer("UTC"),
  FieldService.layer,
  TrashService.layer,
  CalendarService.layer,
);

const deletedAtUtc = "2026-11-13T12:00:00Z";
const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse(deletedAtUtc));
  const projects = yield* ProjectService;
  const folders = yield* FolderService;
  const items = yield* ItemService;
  const trash = yield* TrashService;
  const calendar = yield* CalendarService;
  const fields = yield* FieldService;
  const undo = yield* UndoService;
  const sql = yield* SqlClient.SqlClient;
  const project = yield* projects.create("Billing");
  const area = (title: string, folderId: string | null = null, parentId: string | null = null) =>
    items.create(project.id, folderId, parentId, title);
  const folder = (name: string, parentId: string | null = null) =>
    folders.create(project.id, parentId, name);
  return { projects, folders, items, trash, calendar, fields, undo, sql, project, area, folder };
});

function test<A, E>(
  name: string,
  run: (world: Effect.Success<typeof setup>) => Effect.Effect<A, E, SqlClient.SqlClient>,
) {
  it.effect(name, () => setup.pipe(Effect.flatMap(run), Effect.provide(services), withSchema));
}

const edit = (title: string) => ({
  title,
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: null,
  dueTime: null,
});

test("Listing and empty ignore live rows when nothing has been deleted", ({
  area,
  trash,
  projects,
}) =>
  Effect.gen(function* () {
    yield* area("Live");

    expect(yield* trash.list(null)).toEqual([]);
    yield* trash.empty(null);

    expect(yield* projects.list()).toHaveLength(1);
    expect(yield* readItems()).toHaveLength(1);
  }));

test("Listing groups nested batches newest first with original paths, counts and blockers", (world) =>
  Effect.gen(function* () {
    const { projects, folders, items, trash, project, area, folder } = world;
    const outer = yield* folder("dbo");
    const inner = yield* folder("Tables", outer.id);
    const parent = yield* area("Parent", inner.id);
    const child = yield* area("Sub", inner.id, parent.id);
    yield* area("Sibling", inner.id, parent.id);
    yield* area("Beside", outer.id);
    const other = yield* projects.create("Other");
    yield* items.delete(project.id, inner.id, child.id);
    yield* TestClock.adjust("1 minute");
    yield* items.delete(project.id, inner.id, parent.id);
    yield* TestClock.adjust("1 minute");
    yield* folders.delete(project.id, outer.id);
    yield* TestClock.adjust("1 minute");
    yield* projects.delete(other.id);

    const batches = yield* trash.list(null);

    expect(batches).toMatchObject([
      { kind: "project", title: "Other", path: [] },
      {
        kind: "folder",
        title: "dbo",
        path: ["Billing"],
        topNodeId: outer.id,
        folderCount: 2,
        itemCount: 1,
      },
      {
        kind: "item",
        title: "Parent",
        path: ["Billing", "dbo", "Tables"],
        itemCount: 2,
        restoreBlockedReason: "Restore the folder 'Tables' first",
      },
      {
        kind: "item",
        title: "Sub",
        path: ["Billing", "dbo", "Tables", "Parent"],
        folderCount: 0,
        itemCount: 1,
        deletedAtUtc,
        restoreBlockedReason: "Restore the item 'Parent' first",
      },
    ]);
    expect(yield* trash.list(project.id)).toEqual(batches.slice(1));
  }));

test("A deleted parent folder or project blocks earlier batches until it is restored", (world) =>
  Effect.gen(function* () {
    const { projects, folders, items, trash, sql, project, folder, area } = world;
    const outer = yield* folder("Outer");
    const inner = yield* folder("Inner", outer.id);
    const root = yield* area("Root");
    const later = yield* area("Later", outer.id);
    const rootBatch = yield* items.delete(project.id, null, root.id);
    const innerBatch = yield* folders.delete(project.id, inner.id);
    const outerBatch = yield* folders.delete(project.id, outer.id);
    const projectBatch = yield* projects.delete(project.id);
    const before = yield* sql.withTransaction(sql`SELECT * FROM Folder WHERE Id = ${inner.id}`);

    expect(
      (yield* trash.list(project.id)).find((batch) => batch.batchId === rootBatch),
    ).toMatchObject({ path: ["Billing"], restoreBlockedReason: "Restore the project first" });
    expect((yield* Effect.flip(trash.restore(innerBatch))).message).toBe(
      "Restore the folder 'Outer' first",
    );
    expect((yield* Effect.flip(trash.restore(outerBatch))).message).toBe(
      "Restore the project first",
    );
    expect(yield* sql.withTransaction(sql`SELECT * FROM Folder WHERE Id = ${inner.id}`)).toEqual(
      before,
    );

    yield* trash.restore(projectBatch);
    yield* trash.restore(outerBatch);

    expect((yield* readItems()).find((row) => row.Id === later.id)?.DeletedAtUtc).toBeNull();
    expect(yield* trash.list(project.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ batchId: innerBatch, restoreBlockedReason: null }),
        expect.objectContaining({ batchId: rootBatch }),
      ]),
    );
    yield* trash.restore(innerBatch);
    yield* trash.restore(rootBatch);
    expect(yield* trash.list(project.id)).toEqual([]);
    expect((yield* Effect.flip(trash.restore(rootBatch))).message).toContain("no longer exists");
    expect((yield* Effect.flip(trash.purge(rootBatch))).message).toContain("no longer exists");
  }));

test("Restoring appends the top node after the largest sibling order and preserves descendants and other batches", (world) =>
  Effect.gen(function* () {
    const { items, trash, sql, project, area } = world;
    const first = yield* area("First");
    const child = yield* area("Child", null, first.id);
    const second = yield* area("Second");
    const third = yield* area("Third");
    const unrelated = yield* area("Unrelated");
    const otherBatch = yield* items.delete(project.id, null, unrelated.id);
    const batch = yield* items.delete(project.id, null, first.id);
    yield* sql`UPDATE TodoItem SET SortOrder = 7 WHERE Id IN (${third.id}, ${child.id})`;

    yield* trash.restore(batch);

    const rows = yield* readItems();
    expect(rows.find((row) => row.Id === first.id)).toMatchObject({
      SortOrder: 8,
      DeletedAtUtc: null,
    });
    expect(rows.find((row) => row.Id === child.id)).toMatchObject({
      SortOrder: 7,
      DeletedAtUtc: null,
    });
    expect(rows.find((row) => row.Id === second.id)).toMatchObject({ SortOrder: 0 });
    expect(yield* trash.list(null)).toMatchObject([{ batchId: otherBatch }]);
  }));

for (const { enabled, completed, expected } of [
  { enabled: true, completed: false, expected: false },
  { enabled: true, completed: true, expected: true },
  { enabled: false, completed: false, expected: true },
]) {
  test(`Restoring a ${completed ? "completed" : "open"} child with auto-completion ${enabled ? "on" : "off"} reconciles as configured`, (world) =>
    Effect.gen(function* () {
      const { items, trash, undo, project, area } = world;
      yield* setAutoComplete(enabled);
      const parent = yield* area("Parent");
      const child = yield* area("Child", null, parent.id);
      const sibling = yield* area("Sibling", null, parent.id);
      if (completed) {
        yield* items.setCompleted(project.id, null, child.id, true);
      }
      const batch = yield* items.delete(project.id, null, child.id);
      yield* items.setCompleted(project.id, null, sibling.id, true);
      if (!enabled) {
        yield* items.setCompleted(project.id, null, parent.id, true);
      }
      const before = yield* readItems();

      yield* trash.restore(batch);

      const after = yield* readItems();
      expect(after.find((row) => row.Id === parent.id)?.CompletedAtUtc !== null).toBe(expected);
      expect((yield* undo.apply("undo"))?.label).toBe("Restore 'Child'");
      expect(yield* readItems()).toEqual(before);
      expect(yield* trash.list(null)).toMatchObject([{ batchId: batch }]);
      yield* undo.apply("redo");
      expect(yield* readItems()).toEqual(after);
    }));
}

test("A restored dated item returns to the active search and date inputs with its existing FTS mapping", (world) =>
  Effect.gen(function* () {
    const { items, trash, sql, project, area } = world;
    const item = yield* area("Zebra crossing");
    yield* items.edit(item.id, {
      ...edit(item.title),
      dueDate: Temporal.PlainDate.from("2026-11-16"),
    });
    const batch = yield* items.delete(project.id, null, item.id);
    const search = () =>
      sql.withTransaction(sql`SELECT item.Title, item.DueDate FROM TodoItem AS item
      JOIN TodoItemSearchRow AS mapping ON mapping.ItemId = item.Id
      JOIN TodoItemSearch ON TodoItemSearch.rowid = mapping.RowId
      WHERE item.DeletedAtUtc IS NULL AND TodoItemSearch MATCH 'zebra'`);
    const mapping = yield* sql`SELECT * FROM TodoItemSearchRow`;
    expect(yield* search()).toEqual([]);

    yield* trash.restore(batch);

    expect(yield* search()).toEqual([{ Title: item.title, DueDate: "2026-11-16" }]);
    expect(yield* sql`SELECT * FROM TodoItemSearchRow`).toEqual(mapping);
    const loaded = yield* items.loadArea(project.id, null);
    expect(loaded.items.open[0]?.item.dueDate?.toString()).toBe("2026-11-16");
  }));

test("Purging an item branch removes only its rows, custom values, links and search entries", (world) =>
  Effect.gen(function* () {
    const { items, trash, fields, undo, sql, project, area } = world;
    const doomed = yield* area("Doomed");
    const child = yield* area("Child", null, doomed.id);
    const kept = yield* area("Kept");
    const note = yield* fields.create("Note", "Text", null);
    yield* items.edit(doomed.id, edit(doomed.title), [
      { fieldDefinitionId: note.id, textValue: "gone" },
    ]);
    yield* items.edit(kept.id, edit(kept.title), [
      { fieldDefinitionId: note.id, textValue: "stays" },
    ]);
    const keptBatch = yield* items.delete(project.id, null, kept.id);
    const batch = yield* items.delete(project.id, null, doomed.id);

    yield* trash.purge(batch);

    expect(yield* readItems()).toMatchObject([{ Id: kept.id }]);
    expect(yield* sql.withTransaction(sql`SELECT ItemId FROM ItemFieldValue`)).toEqual([
      { ItemId: kept.id },
    ]);
    expect(yield* sql.withTransaction(sql`SELECT ItemId FROM TodoItemSearchRow`)).toEqual([
      { ItemId: kept.id },
    ]);
    expect(yield* sql.withTransaction(sql`SELECT Title FROM TodoItemSearch`)).toEqual([
      { Title: kept.title },
    ]);
    expect(yield* trash.list(null)).toMatchObject([{ batchId: keptBatch }]);
    expect((yield* Effect.flip(undo.apply("undo"))).message).toContain("permanently deleted");
    expect(yield* undo.status()).toMatchObject({ undo: "Delete 'Doomed'", redo: null });
    expect((yield* readItems()).some((row) => row.Id === child.id)).toBe(false);
  }));

test("Purging a nested folder removes its subfolders and item trees and keeps live siblings", (world) =>
  Effect.gen(function* () {
    const { folders, trash, sql, project, folder, area } = world;
    const outer = yield* folder("Outer");
    const inner = yield* folder("Inner", outer.id);
    const parent = yield* area("Parent", inner.id);
    yield* area("Child", inner.id, parent.id);
    const survivor = yield* area("Survivor");
    const batch = yield* folders.delete(project.id, outer.id);

    yield* trash.purge(batch);

    expect(yield* sql.withTransaction(sql`SELECT Id FROM Folder`)).toEqual([]);
    expect(yield* readItems()).toMatchObject([{ Id: survivor.id }]);
    expect(yield* sql.withTransaction(sql`SELECT Title FROM TodoItemSearch`)).toEqual([
      { Title: survivor.title },
    ]);
  }));

test("Purging a project includes earlier batches and its choices, values and settings", (world) =>
  Effect.gen(function* () {
    const { projects, items, fields, trash, sql, project, folder, area } = world;
    const other = yield* projects.create("Other");
    const kept = yield* items.create(other.id, null, null, "Kept");
    const nested = yield* folder("Nested");
    const early = yield* area("Earlier", nested.id);
    const late = yield* area("Later");
    const own = yield* fields.create("Own choice", "Choice", project.id);
    const choice = yield* fields.addChoice(own.id, "Pick me");
    const global = yield* fields.create("Global note", "Text", null);
    yield* items.edit(early.id, edit(early.title), [
      { fieldDefinitionId: own.id, choiceId: choice.id },
    ]);
    yield* items.edit(late.id, edit(late.title), [
      { fieldDefinitionId: global.id, textValue: "gone" },
    ]);
    yield* sql`INSERT INTO ProjectSetting (ProjectId, Key, Value) VALUES (${project.id}, 'autoCompleteParents', 'false')`;
    yield* items.delete(project.id, nested.id, early.id);
    const batch = yield* projects.delete(project.id);
    expect((yield* trash.list(null)).find((row) => row.batchId === batch)?.earlierBatchCount).toBe(
      1,
    );

    yield* trash.purge(batch);

    expect(yield* readItems()).toMatchObject([{ Id: kept.id }]);
    expect(yield* projects.list()).toMatchObject([{ project: { id: other.id } }]);
    expect(yield* sql.withTransaction(sql`SELECT Id FROM Project`)).toEqual([{ Id: other.id }]);
    expect(yield* sql.withTransaction(sql`SELECT Id FROM Folder`)).toEqual([]);
    expect(yield* sql.withTransaction(sql`SELECT Id FROM FieldDefinition`)).toEqual([
      { Id: global.id },
    ]);
    expect(yield* sql.withTransaction(sql`SELECT * FROM FieldChoice`)).toEqual([]);
    expect(yield* sql.withTransaction(sql`SELECT * FROM ItemFieldValue`)).toEqual([]);
    expect(yield* sql.withTransaction(sql`SELECT * FROM ProjectSetting`)).toEqual([]);
    expect(yield* sql.withTransaction(sql`SELECT Title FROM TodoItemSearch`)).toEqual([
      { Title: kept.title },
    ]);
    expect(yield* trash.list(null)).toEqual([]);
  }));

test("Purging a parent refuses earlier item or folder batches and leaves no partial write", (world) =>
  Effect.gen(function* () {
    const { items, folders, trash, project, area, folder } = world;
    const outer = yield* folder("Outer");
    const inner = yield* folder("Inner", outer.id);
    const parent = yield* area("Parent", outer.id);
    const child = yield* area("Child", outer.id, parent.id);
    const childBatch = yield* items.delete(project.id, outer.id, child.id);
    const parentBatch = yield* items.delete(project.id, outer.id, parent.id);
    const innerBatch = yield* folders.delete(project.id, inner.id);
    const outerBatch = yield* folders.delete(project.id, outer.id);

    expect((yield* Effect.flip(trash.purge(parentBatch))).message).toBe(
      "'Child' still belongs to 'Parent'. Delete 'Child' permanently first.",
    );
    expect((yield* Effect.flip(trash.purge(outerBatch))).message).toBe(
      "'Parent' still belongs to 'Outer'. Delete 'Parent' permanently first.",
    );
    yield* trash.purge(childBatch);
    yield* trash.purge(parentBatch);
    expect((yield* Effect.flip(trash.purge(outerBatch))).message).toContain(
      "'Inner' still belongs to 'Outer'",
    );
    yield* trash.purge(innerBatch);
    yield* trash.restore(outerBatch);

    expect(yield* readItems()).toEqual([]);
    expect(yield* trash.list(null)).toEqual([]);
  }));

test("Purge and empty refuse a live dependent and empty rolls back an earlier project's purge", (world) =>
  Effect.gen(function* () {
    const { projects, items, folders, trash, sql, project, area } = world;
    const first = yield* area("Doomed");
    yield* items.delete(project.id, null, first.id);
    const other = yield* projects.create("Other");
    const unsafeFolder = yield* folders.create(other.id, null, "Unsafe");
    const live = yield* items.create(other.id, unsafeFolder.id, null, "Live");
    yield* sql`UPDATE Folder SET DeletedAtUtc = UpdatedAtUtc, DeletionBatchId = Id WHERE Id = ${unsafeFolder.id}`;
    const before = yield* trash.list(null);

    const purge = yield* Effect.flip(trash.purge(unsafeFolder.id));
    const empty = yield* Effect.flip(trash.empty(null));

    expect(purge.message).toContain("'Live' still belongs to 'Unsafe'");
    expect(empty.message).toContain("'Live' still belongs to 'Unsafe'");
    expect(yield* trash.list(null)).toEqual(before);
    expect(new Set((yield* readItems()).map((row) => row.Id))).toEqual(
      new Set([first.id, live.id]),
    );
  }));

test("A refused purge leaves nothing behind for the next operation to save", (world) =>
  Effect.gen(function* () {
    const { items, trash, project, area } = world;
    const parent = yield* area("Parent");
    const child = yield* area("Child", null, parent.id);
    yield* items.delete(project.id, null, child.id);
    const parentBatch = yield* items.delete(project.id, null, parent.id);
    yield* Effect.flip(trash.purge(parentBatch));
    const other = yield* area("Unrelated");
    const otherBatch = yield* items.delete(project.id, null, other.id);

    yield* trash.restore(otherBatch);

    const rows = yield* readItems();
    expect(rows.find((row) => row.Id === parent.id)?.DeletedAtUtc).not.toBeNull();
    expect(rows.find((row) => row.Id === child.id)?.DeletedAtUtc).not.toBeNull();
    expect(rows.find((row) => row.Id === other.id)?.DeletedAtUtc).toBeNull();
    expect(yield* trash.list(null)).toHaveLength(2);
  }));

test("Restoring one item batch leaves a sibling batch deleted", ({ items, trash, project, area }) =>
  Effect.gen(function* () {
    const first = yield* area("First");
    const second = yield* area("Second");
    const firstBatch = yield* items.delete(project.id, null, first.id);
    yield* items.delete(project.id, null, second.id);

    yield* trash.restore(firstBatch);

    const rows = yield* readItems();
    expect(rows.find((row) => row.Id === first.id)?.DeletedAtUtc).toBeNull();
    expect(rows.find((row) => row.Id === second.id)?.DeletedAtUtc).not.toBeNull();
  }));

test("Restoring a folder leaves an item deleted earlier in another batch in the trash", (world) =>
  Effect.gen(function* () {
    const { items, folders, trash, project, folder, area } = world;
    const parent = yield* folder("Folder");
    const early = yield* area("Early", parent.id);
    const late = yield* area("Late", parent.id);
    const earlyBatch = yield* items.delete(project.id, parent.id, early.id);
    const folderBatch = yield* folders.delete(project.id, parent.id);

    yield* trash.restore(folderBatch);

    const rows = yield* readItems();
    expect(rows.find((row) => row.Id === late.id)?.DeletedAtUtc).toBeNull();
    expect(rows.find((row) => row.Id === early.id)?.DeletionBatchId).toBe(earlyBatch);
    expect(yield* trash.list(null)).toMatchObject([{ title: "Early", restoreBlockedReason: null }]);
  }));

test("Restoring a project restores its folders and items after the live projects", (world) =>
  Effect.gen(function* () {
    const { projects, trash, sql, project, folder, area } = world;
    const nested = yield* folder("Folder");
    const item = yield* area("Item", nested.id);
    const batch = yield* projects.delete(project.id);
    yield* projects.create("Live");

    yield* trash.restore(batch);

    expect(yield* readItems()).toMatchObject([{ Id: item.id, DeletedAtUtc: null }]);
    expect(yield* sql.withTransaction(sql`SELECT DeletedAtUtc FROM Folder`)).toEqual([
      { DeletedAtUtc: null },
    ]);
    expect((yield* projects.list()).map(({ project: row }) => row.name)).toEqual([
      "Live",
      "Billing",
    ]);
    expect(yield* trash.list(null)).toEqual([]);
  }));

test("Empty permanently removes deletions within scope and leaves live rows", (world) =>
  Effect.gen(function* () {
    const { projects, items, folders, trash, sql, project, area, folder } = world;
    const gone = yield* projects.create("Gone");
    yield* items.create(gone.id, null, null, "In deleted project");
    const deletedProject = yield* projects.delete(gone.id);
    const kept = yield* area("Kept");
    const nested = yield* folder("Nested");
    const nestedItem = yield* area("Earlier", nested.id);
    yield* items.delete(project.id, nested.id, nestedItem.id);
    yield* folders.delete(project.id, nested.id);

    yield* trash.empty(project.id);

    expect(yield* trash.list(null)).toMatchObject([{ batchId: deletedProject }]);
    yield* trash.empty(null);
    expect(yield* trash.list(null)).toEqual([]);
    expect(yield* readItems()).toMatchObject([{ Id: kept.id }]);
    expect(yield* sql.withTransaction(sql`SELECT Id FROM Project`)).toEqual([{ Id: project.id }]);
    expect(yield* sql.withTransaction(sql`SELECT Id FROM Folder`)).toEqual([]);
  }));

test("Emptying the trash records no undo step and leaves the delete step unreplayable", (world) =>
  Effect.gen(function* () {
    const { items, trash, undo, project, area } = world;
    const doomed = yield* area("Doomed");
    yield* items.delete(project.id, null, doomed.id);
    const history = yield* undo.status();

    yield* trash.empty(null);
    const refusal = yield* Effect.flip(undo.apply("undo"));

    expect(history.undo).toBe("Delete 'Doomed'");
    expect(refusal.message).toBe("This item was permanently deleted since; can't undo.");
    expect(yield* undo.status()).toEqual(history);
  }));

const unknownBatchId = "019A0000-0000-7000-8000-00000000BEEF";

test("Restore and purge refuse an unknown batch and change nothing", (world) =>
  Effect.gen(function* () {
    const { items, trash, undo, project, area } = world;
    const item = yield* area("Deleted");
    yield* items.delete(project.id, null, item.id);
    const rows = yield* readItems();
    const listed = yield* trash.list(null);
    const history = yield* undo.status();

    const restore = yield* Effect.flip(trash.restore(unknownBatchId));
    const purge = yield* Effect.flip(trash.purge(unknownBatchId));

    for (const failure of [restore, purge]) {
      expect(failure.message).toBe(
        "That deletion no longer exists. It may already have been restored or deleted permanently.",
      );
    }
    expect(yield* readItems()).toEqual(rows);
    expect(yield* trash.list(null)).toEqual(listed);
    expect(yield* undo.status()).toEqual(history);
  }));

test("A repeated restore is refused and records no second step", (world) =>
  Effect.gen(function* () {
    const { items, trash, undo, project, area } = world;
    const item = yield* area("Deleted");
    const batch = yield* items.delete(project.id, null, item.id);
    yield* trash.restore(batch);
    const rows = yield* readItems();
    const history = yield* undo.status();

    const repeated = yield* Effect.flip(trash.restore(batch.toLowerCase()));

    expect(repeated.message).toContain("no longer exists");
    expect(yield* readItems()).toEqual(rows);
    expect(yield* trash.list(null)).toEqual([]);
    expect(history.undo).toBe("Restore 'Deleted'");
    expect(yield* undo.status()).toEqual(history);
  }));

test("Restored items reappear in the calendar with their sub-items", (world) =>
  Effect.gen(function* () {
    const { items, trash, calendar, project, area, folder } = world;
    const deletedArea = yield* folder("Area");
    const parent = yield* area("Parent", deletedArea.id);
    const child = yield* area("Child", deletedArea.id, parent.id);
    for (const [id, title, day] of [
      [parent.id, "Parent", "2026-11-16"],
      [child.id, "Child", "2026-11-17"],
    ] as const) {
      yield* items.edit(id, { ...edit(title), dueDate: Temporal.PlainDate.from(day) });
    }
    const week = {
      projectId: project.id,
      fromDate: Temporal.PlainDate.from("2026-11-16"),
      toDateExclusive: Temporal.PlainDate.from("2026-11-23"),
      includeCompleted: false,
    };
    const titles = () =>
      Effect.map(calendar.load(week), (entries) => entries.map((entry) => entry.title).toSorted());
    const batch = yield* world.folders.delete(project.id, deletedArea.id);
    const whileDeleted = yield* titles();

    yield* trash.restore(batch);

    expect(whileDeleted).toEqual([]);
    expect(yield* titles()).toEqual(["Child", "Parent"]);
    expect((yield* calendar.load({ ...week, projectId: null })).length).toBe(2);
  }));
