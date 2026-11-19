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
import { withSchema } from "./fixtures.js";

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

function test<A, E>(name: string, run: (world: World) => Effect.Effect<A, E, SqlClient.SqlClient>) {
  it.effect(name, () => setup.pipe(Effect.flatMap(run), Effect.provide(services), withSchema));
}

interface DateFields {
  readonly dueDate?: string;
  readonly dueTime?: string;
  readonly scheduledStart?: string;
  readonly scheduledEnd?: string;
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
    scheduledStart:
      fields.scheduledStart === undefined
        ? null
        : Temporal.PlainDateTime.from(fields.scheduledStart),
    scheduledEnd:
      fields.scheduledEnd === undefined ? null : Temporal.PlainDateTime.from(fields.scheduledEnd),
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

test("Range includes due boundaries and overlapping schedules", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "First", { dueDate: "2026-11-01" });
    yield* seed(world, "Last", { dueDate: "2026-11-30", dueTime: "08:00" });
    yield* seed(world, "Outside", { dueDate: "2026-12-01" });
    yield* seed(world, "Spanning", {
      scheduledStart: "2026-10-31T22:00",
      scheduledEnd: "2026-11-02T02:00",
    });
    yield* seed(world, "No end", { scheduledStart: "2026-10-31T23:45" });

    const entries = yield* world.calendar.load(range("2026-11-01", "2026-12-01"));

    expect(entries).toHaveLength(4);
    expect(titles(entries)).toEqual(["First", "Last", "No end", "Spanning"]);
  }));

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

test("Due date on the exclusive end date is excluded and the day before is included", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Last day", { dueDate: "2026-11-22" });
    yield* seed(world, "End date", { dueDate: "2026-11-23" });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-23"));

    expect(titles(entries)).toEqual(["Last day"]);
  }));

test("Schedule ending exactly at the range start is excluded", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Ends at start", {
      scheduledStart: "2026-11-15T23:00",
      scheduledEnd: "2026-11-16T00:00",
    });
    yield* seed(world, "Ends after start", {
      scheduledStart: "2026-11-15T23:00",
      scheduledEnd: "2026-11-16T00:01",
    });
    yield* seed(world, "Starts at end", {
      scheduledStart: "2026-11-17T00:00",
      scheduledEnd: "2026-11-17T01:00",
    });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(titles(entries)).toEqual(["Ends after start"]);
  }));

test("Zero-length schedule at midnight of the first day is included", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "At midnight", {
      scheduledStart: "2026-11-16T00:00",
      scheduledEnd: "2026-11-16T00:00",
    });
    yield* seed(world, "At noon", {
      scheduledStart: "2026-11-16T12:00",
      scheduledEnd: "2026-11-16T12:00",
    });
    yield* seed(world, "At next midnight", {
      scheduledStart: "2026-11-17T00:00",
      scheduledEnd: "2026-11-17T00:00",
    });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(titles(entries)).toEqual(["At midnight", "At noon"]);
  }));

test("Schedule without end reaching into the range by its default length is included", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Reaches in", { scheduledStart: "2026-11-15T23:45" });
    yield* seed(world, "Misses", { scheduledStart: "2026-11-15T23:29" });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(titles(entries)).toEqual(["Reaches in"]);
  }));

test("Legacy fractional timestamps are compared by value at the range boundaries", (world) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const before = yield* seed(world, "Ends before start", {});
    const after = yield* seed(world, "Ends after start", {});
    const late = yield* seed(world, "Starts before end", {});
    const setSchedule = (id: string, start: string, end: string | null) =>
      sql.withTransaction(
        sql`UPDATE TodoItem SET ScheduledStart = ${start}, ScheduledEnd = ${end} WHERE Id = ${id}`,
      );
    yield* setSchedule(before.id, "2026-11-15 23:00:00", "2026-11-15 23:59:59.9999999");
    yield* setSchedule(after.id, "2026-11-15 23:00:00", "2026-11-16 00:00:00.0000001");
    yield* setSchedule(late.id, "2026-11-16 23:59:59.9999999", null);

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(titles(entries)).toEqual(["Ends after start", "Starts before end"]);
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

test("Item with a due date and a schedule produces both entries", (world) =>
  Effect.gen(function* () {
    const item = yield* seed(world, "Both", {
      dueDate: "2026-11-16",
      dueTime: "17:00",
      scheduledStart: "2026-11-16T09:00",
      scheduledEnd: "2026-11-16T10:00",
    });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-17"));

    expect(entries).toHaveLength(2);
    const due = entries.find((entry) => entry.kind === "due");
    const scheduled = entries.find((entry) => entry.kind === "scheduled");
    expect(due?.startTime?.toString()).toBe("17:00:00");
    expect(scheduled?.startTime?.toString()).toBe("09:00:00");
    expect(entries.every((entry) => entry.itemId === item.id)).toBe(true);
  }));

test("Item due inside the range but scheduled outside it returns only the due entry", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Due now", {
      dueDate: "2026-11-18",
      scheduledStart: "2026-01-05T09:00",
      scheduledEnd: "2026-01-05T10:00",
    });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-23"));

    expect(entries.map((entry) => entry.kind)).toEqual(["due"]);
  }));

test("Item scheduled inside the range but due outside it returns only the scheduled entry", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Scheduled now", {
      dueDate: "2027-01-15",
      scheduledStart: "2026-11-18T09:00",
      scheduledEnd: "2026-11-18T10:00",
    });

    const entries = yield* world.calendar.load(range("2026-11-16", "2026-11-23"));

    expect(entries.map((entry) => entry.kind)).toEqual(["scheduled"]);
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
