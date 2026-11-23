import { expect, it } from "@effect/vitest";
import {
  EntityMissing,
  MetadataRuleError,
  SettingsCatalogue,
  type CalendarEntry,
  type CalendarQuery,
} from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { CalendarService } from "../../../src/services/calendar-service.js";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { SettingsService } from "../../../src/services/settings-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { readItems, withSchema } from "./fixtures.js";

const ticksPerHour = 36_000_000_000n;
const ticksPerDay = 24n * ticksPerHour;

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  FolderService.layer,
  ItemService.layer("UTC"),
  LookupService.layer,
  SettingsService.layer,
  CalendarService.layer,
);

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-11-16T12:00:00Z"));
  const projects = yield* ProjectService;
  const folders = yield* FolderService;
  const items = yield* ItemService;
  const lookups = yield* LookupService;
  const settings = yield* SettingsService;
  const calendar = yield* CalendarService;
  const project = yield* projects.create("Billing");
  return { projects, folders, items, lookups, settings, calendar, project };
});

type World = Effect.Success<typeof setup>;

function test<A, E>(
  name: string,
  run: (world: World) => Effect.Effect<A, E, SqlClient.SqlClient | UndoService>,
) {
  it.effect(name, () => setup.pipe(Effect.flatMap(run), Effect.provide(services), withSchema));
}

interface DateFields {
  readonly dueDate?: string;
  readonly dueTime?: string;
  readonly itemTypeId?: string;
  readonly priorityLevelId?: string;
}

function editFields(title: string, fields: DateFields) {
  const date = (text: string | undefined) => (text === undefined ? null : text);
  return {
    title,
    description: null,
    ticketNumber: null,
    itemTypeId: date(fields.itemTypeId),
    priorityLevelId: date(fields.priorityLevelId),
    dueDate: fields.dueDate === undefined ? null : Temporal.PlainDate.from(fields.dueDate),
    dueTime: fields.dueTime === undefined ? null : Temporal.PlainTime.from(fields.dueTime),
  };
}

/** Creates an item in an area and sets its calendar fields. */
function seed(
  world: World,
  title: string,
  fields: DateFields,
  area: {
    readonly projectId?: string;
    readonly folderId?: string;
    readonly parentId?: string;
  } = {},
) {
  return Effect.gen(function* () {
    const created = yield* world.items.create(
      area.projectId ?? world.project.id,
      area.folderId ?? null,
      area.parentId ?? null,
      title,
    );
    yield* world.items.edit(created.id, editFields(title, fields));
    return created;
  });
}

function range(
  fromDate: string,
  toDateExclusive: string,
  options: { readonly projectId?: string; readonly includeCompleted?: boolean } = {},
): CalendarQuery {
  return {
    projectId: options.projectId ?? null,
    fromDate: Temporal.PlainDate.from(fromDate),
    toDateExclusive: Temporal.PlainDate.from(toDateExclusive),
    includeCompleted: options.includeCompleted ?? false,
  };
}

function titles(entries: ReadonlyArray<CalendarEntry>) {
  return [...new Set(entries.map((entry) => entry.title))].toSorted();
}

test("Project scope and completion filter apply to sub-items", (world) =>
  Effect.gen(function* () {
    const other = yield* world.projects.create("Other");
    const parent = yield* seed(world, "Parent", {});
    const child = yield* seed(world, "Child", { dueDate: "2026-11-16" }, { parentId: parent.id });
    const completed = yield* seed(world, "Completed", { dueDate: "2026-11-16" });
    yield* world.items.setCompleted(world.project.id, null, completed.id, true);
    yield* seed(world, "Other item", { dueDate: "2026-11-16" }, { projectId: other.id });
    const scoped = { projectId: world.project.id };

    const openOnly = yield* world.calendar.load(range("2026-11-16", "2026-11-17", scoped));
    const withCompleted = yield* world.calendar.load(
      range("2026-11-16", "2026-11-17", { ...scoped, includeCompleted: true }),
    );

    expect(openOnly.map((entry) => entry.itemId)).toEqual([child.id]);
    expect(titles(withCompleted)).toEqual(["Child", "Completed"]);
    expect(withCompleted.find((entry) => entry.itemId === completed.id)?.isCompleted).toBe(true);
  }));

test("All projects scope includes every active project", (world) =>
  Effect.gen(function* () {
    const other = yield* world.projects.create("Other");
    yield* seed(world, "Mine", { dueDate: "2026-11-16" });
    yield* seed(world, "Theirs", { dueDate: "2026-11-16" }, { projectId: other.id });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(titles(entries)).toEqual(["Mine", "Theirs"]);
  }));

test("Deleted item, folder and project are excluded", (world) =>
  Effect.gen(function* () {
    const deletedProject = yield* world.projects.create("Deleted project");
    const deletedFolder = yield* world.folders.create(world.project.id, null, "Deleted folder");
    const due = { dueDate: "2026-11-16" };
    const active = yield* seed(world, "Active", due);
    const deletedItem = yield* seed(world, "Deleted item", due);
    yield* seed(world, "Folder item", due, { folderId: deletedFolder.id });
    yield* seed(world, "Project item", due, { projectId: deletedProject.id });
    yield* world.items.delete(world.project.id, null, deletedItem.id);
    yield* world.folders.delete(world.project.id, deletedFolder.id);
    yield* world.projects.delete(deletedProject.id);

    const entries = yield* world.calendar.load(
      range("2026-11-16", "2026-11-17", { includeCompleted: true }),
    );

    expect(entries.map((entry) => entry.itemId)).toEqual([active.id]);
  }));

test("Sub-item deleted together with its parent is excluded", (world) =>
  Effect.gen(function* () {
    const parent = yield* seed(world, "Parent", {});
    yield* seed(world, "Child", { dueDate: "2026-11-16" }, { parentId: parent.id });
    yield* seed(world, "Survivor", { dueDate: "2026-11-16" });
    yield* world.items.delete(world.project.id, null, parent.id);

    const entries = yield* world.calendar.load(
      range("2026-11-16", "2026-11-17", { includeCompleted: true }),
    );

    expect(titles(entries)).toEqual(["Survivor"]);
  }));

test("Project thresholds override global thresholds", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Due", { dueDate: "2026-11-16" });
    yield* world.settings.setGlobal(SettingsCatalogue.urgencyYellowThreshold, 5n * ticksPerDay);
    yield* world.settings.setProjectOverride(
      world.project.id,
      SettingsCatalogue.urgencyYellowThreshold,
      2n * ticksPerDay,
    );

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(entries).toHaveLength(1);
    expect(entries[0]!.thresholds.yellow).toBe(2n * ticksPerDay);
    expect(entries[0]!.thresholds.red).toBe(24n * ticksPerHour);
  }));

test("Entries carry type, numbered priority and status names", (world) =>
  Effect.gen(function* () {
    const types = yield* world.lookups.itemTypes.list();
    const priority = yield* world.lookups.priorityLevels.add("Urgent", 1);
    const status = yield* world.lookups.statuses.add("Reviewing", "Open");
    const item = yield* seed(world, "Due", {
      dueDate: "2026-11-16",
      itemTypeId: types[0]!.id,
      priorityLevelId: priority.id,
    });
    yield* world.items.setStatus(item.id, status.id);

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(entries[0]).toMatchObject({
      itemType: types[0]!.name,
      priority: "1 · Urgent",
      priorityLevelId: priority.id,
      statusId: status.id,
      statusName: "Reviewing",
    });
  }));

test("Invalid date ranges fail with a rule violation", ({ calendar }) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(calendar.load(range("2026-11-16", "2026-11-16")));

    expect(error).toBeInstanceOf(MetadataRuleError);
  }));

test("Locating an item returns its current folder and rejects deleted items", (world) =>
  Effect.gen(function* () {
    const folder = yield* world.folders.create(world.project.id, null, "Sprint");
    const item = yield* seed(world, "Move me", {});
    yield* world.items.moveToArea(world.project.id, null, folder.id, item.id);

    const location = yield* world.calendar.locateItem(item.id);
    yield* world.items.delete(world.project.id, folder.id, item.id);
    const missing = yield* Effect.flip(world.calendar.locateItem(item.id));

    expect(location).toEqual({ itemId: item.id, projectId: world.project.id, folderId: folder.id });
    expect(missing).toBeInstanceOf(EntityMissing);
  }));

test("Locating an item in a deleted folder reports it missing", (world) =>
  Effect.gen(function* () {
    const folder = yield* world.folders.create(world.project.id, null, "Sprint");
    const item = yield* seed(world, "Hidden", {}, { folderId: folder.id });
    yield* world.folders.delete(world.project.id, folder.id);

    const missing = yield* Effect.flip(world.calendar.locateItem(item.id));

    expect(missing).toBeInstanceOf(EntityMissing);
  }));

test("A month drop keeps the latest due time and records one undoable date change", (world) =>
  Effect.gen(function* () {
    const undo = yield* UndoService;
    const item = yield* seed(world, "Review", {
      dueDate: "2026-11-16",
      dueTime: "10:07:42.1234567",
    });
    const request = {
      itemId: item.id,
      target: { type: "month", date: "2026-11-17" },
    } as const;
    yield* TestClock.setTime(Date.parse("2026-11-16T12:10:00Z"));

    const moved = yield* world.calendar.reschedule(request);
    const query = range("2026-11-16", "2026-11-18");
    const after = yield* world.calendar.load(query);
    const revision = (yield* undo.status()).revision;
    const noop = yield* world.calendar.reschedule(request);
    const unchanged = yield* undo.status();
    const undone = yield* undo.apply("undo");
    const restored = yield* world.calendar.load(query);
    yield* undo.apply("redo");
    const replayed = yield* world.calendar.load(query);
    const persisted = yield* readItems();

    expect(moved?.date).toBe("2026-11-17");
    expect(after).toHaveLength(1);
    expect(after[0]?.dueTime?.toString()).toBe("10:07:42.1234567");
    expect(noop).toBeNull();
    expect(unchanged.revision).toBe(revision);
    expect(undone?.label).toBe("Reschedule 'Review'");
    expect(restored[0]?.date.toString()).toBe("2026-11-16");
    expect(replayed).toEqual(after);
    expect(persisted[0]?.["UpdatedAtUtc"]).toBe("2026-11-16 12:10:00");
  }));

test("Timed due moves set and clear the time while allowing completed items", (world) =>
  Effect.gen(function* () {
    const item = yield* seed(world, "Done", { dueDate: "2026-11-16" });
    yield* world.items.setCompleted(world.project.id, null, item.id, true);
    const entry = { itemId: item.id } as const;
    const query = range("2026-11-16", "2026-11-22", { includeCompleted: true });

    yield* world.calendar.reschedule({
      ...entry,
      target: { type: "time", date: "2026-11-17", minute: 675 },
    });
    const timed = yield* world.calendar.load(query);
    yield* world.calendar.reschedule({ ...entry, target: { type: "all-day", date: "2026-11-18" } });
    const allDay = yield* world.calendar.load(query);
    yield* world.calendar.reschedule({ ...entry, target: { type: "month", date: "2026-11-19" } });
    const month = yield* world.calendar.load(query);

    expect(timed[0]?.date.toString()).toBe("2026-11-17");
    expect(timed[0]?.dueTime?.toString()).toBe("11:15:00");
    expect(allDay[0]?.date.toString()).toBe("2026-11-18");
    expect(allDay[0]?.dueTime).toBeNull();
    expect(month[0]?.date.toString()).toBe("2026-11-19");
    expect(month[0]?.dueTime).toBeNull();
    expect(month[0]?.isCompleted).toBe(true);
  }));

test("Bounds and absent entries reject the reschedule without modifying rows or history", (world) =>
  Effect.gen(function* () {
    const undo = yield* UndoService;
    const item = yield* seed(world, "Deploy", { dueDate: "2026-11-16", dueTime: "23:00" });
    const deleted = yield* seed(world, "Deleted", { dueDate: "2026-11-16" });
    yield* world.items.delete(world.project.id, null, deleted.id);
    const before = yield* readItems();
    const history = yield* undo.status();
    const move = {
      itemId: item.id,
      target: { type: "step", days: 3_000_000, quarters: 0 },
    } as const;

    const overflow = yield* Effect.flip(world.calendar.reschedule(move));
    const removed = yield* Effect.flip(world.calendar.reschedule({ ...move, itemId: deleted.id }));
    const unknown = yield* Effect.flip(
      world.calendar.reschedule({ ...move, itemId: "019A0000-0000-7000-8000-000000000CCD" }),
    );
    const undated = yield* seed(world, "Undated", {});
    const noDue = yield* Effect.flip(world.calendar.reschedule({ ...move, itemId: undated.id }));
    const offGrid = yield* Effect.flip(
      world.calendar.reschedule({
        ...move,
        target: { type: "time", date: "2026-11-16", minute: 61 },
      }),
    );
    const after = yield* readItems();
    const finalHistory = yield* undo.status();

    expect(overflow.message).toMatch(/supported dates/);
    expect([removed, unknown]).toEqual([new EntityMissing("Item"), new EntityMissing("Item")]);
    expect(noDue.message).toBe("Item has no due date to move.");
    expect(offGrid.message).toMatch(/quarter-hour/);
    expect(after.filter((row) => row["Id"] !== undated.id)).toEqual(before);
    expect(finalHistory.revision).toBe(history.revision + 1);
  }));

test("A failed due date write rolls back dates and the undo step", (world) =>
  Effect.gen(function* () {
    const undo = yield* UndoService;
    const sql = yield* SqlClient.SqlClient;
    const item = yield* seed(world, "Deploy", { dueDate: "2026-11-16" });
    yield* sql`CREATE TRIGGER reject_calendar_change AFTER UPDATE OF DueDate ON TodoItem
      BEGIN SELECT RAISE(ABORT, 'calendar rejected'); END`;
    const before = yield* undo.status();

    yield* Effect.flip(
      world.calendar.reschedule({
        itemId: item.id,
        target: { type: "month", date: "2026-11-17" },
      }),
    );
    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-18"));
    const after = yield* undo.status();

    expect(entries[0]?.date.toString()).toBe("2026-11-16");
    expect(after).toEqual(before);
  }));
