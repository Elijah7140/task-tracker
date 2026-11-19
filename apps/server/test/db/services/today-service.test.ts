import { expect, it } from "@effect/vitest";
import type { TodayRow, TodayTree } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { TodayService } from "../../../src/services/today-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { setAutoComplete, timestamp, withSchema } from "./fixtures.js";

const services = (timeZone: string) =>
  Layer.mergeAll(
    ProjectService.layer(timeZone),
    FolderService.layer,
    ItemService.layer(timeZone),
    TodayService.layer(timeZone),
  );

const world = Effect.gen(function* () {
  return {
    projects: yield* ProjectService,
    folders: yield* FolderService,
    items: yield* ItemService,
    today: yield* TodayService,
    undo: yield* UndoService,
  };
});

type World = Effect.Success<typeof world>;

function test<A, E>(
  name: string,
  run: (world: World) => Effect.Effect<A, E, SqlClient.SqlClient | UndoService>,
  options: { readonly now?: string; readonly timeZone?: string } = {},
) {
  it.effect(name, () =>
    TestClock.setTime(Date.parse(options.now ?? "2026-11-13T12:00:00Z")).pipe(
      Effect.andThen(world),
      Effect.flatMap(run),
      Effect.provide(services(options.timeZone ?? "UTC")),
      withSchema,
    ),
  );
}

const COMPLETED_STATUS_ID = "019A0000-0000-7000-8000-000000000204";

/** Inserts a completed item with an exact stored completion time, bypassing the services. */
function insertCompleted(
  projectId: string,
  title: string,
  completedAtUtc: string,
  extra: { readonly FolderId?: string; readonly ParentItemId?: string } = {},
) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO TodoItem ${sql.insert({
      Id: crypto.randomUUID().toUpperCase(),
      ProjectId: projectId,
      Title: title,
      SortOrder: 0,
      CompletedAtUtc: completedAtUtc,
      StatusId: COMPLETED_STATUS_ID,
      CreatedAtUtc: timestamp,
      UpdatedAtUtc: timestamp,
      ...extra,
    })}`;
  });
}

/** Stamps a project or folder as deleted, leaving its items alone. */
function stampDeleted(table: "Project" | "Folder", id: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE ${sql(table)} SET DeletedAtUtc = ${timestamp},
      DeletionBatchId = ${crypto.randomUUID().toUpperCase()} WHERE Id = ${id}`;
  });
}

function flatten(tree: TodayTree): ReadonlyArray<TodayRow> {
  const visit = (rows: ReadonlyArray<TodayRow>): ReadonlyArray<TodayRow> =>
    rows.flatMap((row) => [row, ...visit(row.children)]);
  return tree.projects.flatMap((project) => project.areas.flatMap((area) => visit(area.rows)));
}

const titles = (tree: TodayTree) => flatten(tree).map((row) => row.item.title);

const utcText = (instant: Temporal.Instant) => instant.toString().replace("T", " ").slice(0, -1);

for (const [day, start, end] of [
  ["2026-03-08", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"],
  ["2026-11-01", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"],
] as const) {
  test(
    `The local day of ${day} includes its start and excludes its end`,
    ({ projects, today }) =>
      Effect.gen(function* () {
        const project = yield* projects.create("Project");
        const startUtc = Temporal.Instant.from(start);
        const endUtc = Temporal.Instant.from(end);
        const tick = { nanoseconds: 100 };
        yield* insertCompleted(project.id, "Before", utcText(startUtc.subtract(tick)));
        yield* insertCompleted(project.id, "First", utcText(startUtc));
        yield* insertCompleted(project.id, "Last", utcText(endUtc.subtract(tick)));
        yield* insertCompleted(project.id, "After", utcText(endUtc));

        const result = yield* today.load;

        expect(result.day.toString()).toBe(day);
        expect(titles(result).toSorted()).toEqual(["First", "Last"]);
      }),
    { now: `${day}T12:00:00Z`, timeZone: "America/New_York" },
  );
}

test("Only current completions and their ancestors in active areas are returned", (svc) =>
  Effect.gen(function* () {
    const project = yield* svc.projects.create("Billing");
    const folder = yield* svc.folders.create(project.id, null, "dbo");
    const nested = yield* svc.folders.create(project.id, folder.id, "Views");
    const ancestor = yield* svc.items.create(project.id, nested.id, null, "Ancestor");
    const parent = yield* svc.items.create(project.id, nested.id, ancestor.id, "Parent");
    const child = yield* svc.items.create(project.id, nested.id, parent.id, "Today");
    const reopened = yield* svc.items.create(project.id, nested.id, parent.id, "Reopened");
    const deleted = yield* svc.items.create(project.id, nested.id, parent.id, "Deleted");
    yield* svc.items.create(project.id, nested.id, parent.id, "Still open");
    yield* insertCompleted(project.id, "Yesterday", "2026-11-12 12:00:00", {
      FolderId: nested.id,
      ParentItemId: parent.id,
    });
    yield* svc.items.setCompleted(project.id, nested.id, child.id, true);
    yield* svc.items.setCompleted(project.id, nested.id, reopened.id, true);
    yield* svc.items.setCompleted(project.id, nested.id, reopened.id, false);
    yield* svc.items.setCompleted(project.id, nested.id, deleted.id, true);
    yield* svc.items.delete(project.id, nested.id, deleted.id);
    const gone = yield* svc.projects.create("Deleted project");
    const live = yield* svc.projects.create("Live project");
    const goneFolder = yield* svc.folders.create(live.id, null, "Deleted folder");
    yield* insertCompleted(gone.id, "Item in deleted project", "2026-11-13 11:00:00");
    yield* insertCompleted(live.id, "Item in deleted folder", "2026-11-13 11:00:00", {
      FolderId: goneFolder.id,
    });
    yield* stampDeleted("Project", gone.id);
    yield* stampDeleted("Folder", goneFolder.id);

    const result = yield* svc.today.load;

    const rows = flatten(result);
    expect(rows.map((row) => row.item.title)).toEqual(["Ancestor", "Parent", "Today"]);
    expect(rows.map((row) => row.state)).toEqual(["open", "open", "completedToday"]);
    expect(rows.map((row) => row.item.parentItemId)).toEqual([null, ancestor.id, parent.id]);
    expect(result.projects[0]!.areas[0]!.path).toBe("Billing › dbo › Views");
    expect(result.completedCount).toBe(1);
  }));

test("Projects keep their order and an auto-completed parent counts as a completion", (svc) =>
  Effect.gen(function* () {
    const billing = yield* svc.projects.create("Billing");
    const area = yield* svc.folders.create(billing.id, null, "dbo");
    const context = yield* svc.items.create(billing.id, area.id, null, "Context");
    const parent = yield* svc.items.create(billing.id, area.id, context.id, "Completed parent");
    const child = yield* svc.items.create(billing.id, area.id, parent.id, "Completed child");
    yield* svc.items.create(billing.id, area.id, context.id, "Still open");
    yield* svc.items.setCompleted(billing.id, area.id, child.id, true);
    const alpha = yield* svc.projects.create("Alpha");
    yield* svc.projects.reorder([billing.id, alpha.id]);
    const leaf = yield* svc.items.create(alpha.id, null, null, "Separate project");
    yield* svc.items.setCompleted(alpha.id, null, leaf.id, true);

    const result = yield* svc.today.load;

    expect(result.projects.map((project) => project.name)).toEqual(["Billing", "Alpha"]);
    expect(result.completedCount).toBe(3);
    const [contextRow] = result.projects[0]!.areas[0]!.rows;
    expect(contextRow!.state).toBe("open");
    expect(contextRow!.children.map((row) => row.item.title)).toEqual(["Completed parent"]);
    expect(contextRow!.children[0]!.completedDescendants).toBe(1);
  }));

test("A parent completed on an earlier day is context, and reopening it keeps it as open context", (svc) =>
  Effect.gen(function* () {
    yield* setAutoComplete(false);
    const project = yield* svc.projects.create("Project");
    const parent = yield* svc.items.create(project.id, null, null, "Parent");
    const child = yield* svc.items.create(project.id, null, parent.id, "Child");
    yield* svc.items.setCompleted(project.id, null, parent.id, true);
    yield* TestClock.adjust("1 day");
    yield* svc.items.setCompleted(project.id, null, child.id, true);

    const before = yield* svc.today.load;
    yield* svc.items.setCompleted(project.id, null, parent.id, false);
    const after = yield* svc.today.load;

    expect(flatten(before).map((row) => row.state)).toEqual(["completedEarlier", "completedToday"]);
    expect(before.completedCount).toBe(1);
    expect(flatten(after).map((row) => row.state)).toEqual(["open", "completedToday"]);
  }));

test("Reopening removes an item, and undo and redo put it back and take it out again", (svc) =>
  Effect.gen(function* () {
    const project = yield* svc.projects.create("Project");
    const item = yield* svc.items.create(project.id, null, null, "Filed report");
    yield* svc.items.setCompleted(project.id, null, item.id, true);

    yield* svc.items.setCompleted(project.id, null, item.id, false);
    const reopened = yield* svc.today.load;
    yield* svc.undo.apply("undo");
    const undone = yield* svc.today.load;
    yield* svc.undo.apply("redo");
    const redone = yield* svc.today.load;

    expect(reopened.completedCount).toBe(0);
    expect(titles(undone)).toEqual(["Filed report"]);
    expect(redone.projects).toEqual([]);
  }));

test(
  "Local midnight starts a new, empty day",
  ({ projects, items, today }) =>
    Effect.gen(function* () {
      const project = yield* projects.create("Project");
      const item = yield* items.create(project.id, null, null, "Last task");
      yield* items.setCompleted(project.id, null, item.id, true);

      const beforeMidnight = yield* today.load;
      yield* TestClock.adjust("1 minute");
      const afterMidnight = yield* today.load;

      expect(beforeMidnight.day.toString()).toBe("2026-11-13");
      expect(beforeMidnight.completedCount).toBe(1);
      expect(afterMidnight.day.toString()).toBe("2026-11-14");
      expect(afterMidnight.projects).toEqual([]);
    }),
  { now: "2026-11-14T04:59:00Z", timeZone: "America/New_York" },
);

test("Rows carry status names and whether Push back one day can apply", (svc) =>
  Effect.gen(function* () {
    const project = yield* svc.projects.create("Project");
    const item = yield* svc.items.create(project.id, null, null, "Done");
    yield* svc.items.setCompleted(project.id, null, item.id, true);

    const result = yield* svc.today.load;

    const [row] = flatten(result);
    expect(row!.item.statusName).toBe("Completed");
    expect(row!.item.hasDates).toBe(false);
  }));
