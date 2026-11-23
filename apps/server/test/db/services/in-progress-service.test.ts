import { expect, it } from "@effect/vitest";
import type { ItemEdit } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FolderService } from "../../../src/services/folder-service.js";
import { InProgressService } from "../../../src/services/in-progress-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { withSchema } from "./fixtures.js";

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  FolderService.layer,
  ItemService.layer("UTC"),
  LookupService.layer,
  InProgressService.layer("UTC"),
);

const CRITICAL_PRIORITY_ID = "019A0000-0000-7000-8000-000000000101";
const HIGH_PRIORITY_ID = "019A0000-0000-7000-8000-000000000102";
const QUEUED_STATUS_ID = "019A0000-0000-7000-8000-000000000201";
const IN_PROGRESS_STATUS_ID = "019A0000-0000-7000-8000-000000000202";
const TESTING_STATUS_ID = "019A0000-0000-7000-8000-000000000203";

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-11-13T12:00:00Z"));
  const projects = yield* ProjectService;
  const folders = yield* FolderService;
  const items = yield* ItemService;
  const { statuses } = yield* LookupService;
  const inProgress = yield* InProgressService;
  const sql = yield* SqlClient.SqlClient;

  /** Adds a top-level item and edits in the given status and details. */
  const add = Effect.fnUntraced(function* (
    projectId: string,
    folderId: string | null,
    title: string,
    details: Partial<ItemEdit> = {},
  ) {
    const item = yield* items.create(projectId, folderId, null, title);
    yield* items.edit(item.id, {
      title,
      description: null,
      ticketNumber: null,
      itemTypeId: null,
      priorityLevelId: null,
      dueDate: null,
      dueTime: null,
      statusId: IN_PROGRESS_STATUS_ID,
      ...details,
    });
    return item;
  });

  /** The titles the stack lists, in order. */
  const titles = inProgress.load.pipe(Effect.map((rows) => rows.map((row) => row.title)));
  return { projects, folders, items, statuses, inProgress, sql, add, titles };
});

function test<A, E>(
  name: string,
  run: (world: Effect.Success<typeof setup>) => Effect.Effect<A, E, SqlClient.SqlClient>,
) {
  it.effect(name, () => setup.pipe(Effect.flatMap(run), Effect.provide(services), withSchema));
}

test("The stack is empty when no item has an in-progress status", ({ inProgress }) =>
  Effect.gen(function* () {
    const rows = yield* inProgress.load;

    expect(rows).toEqual([]);
  }));

test("A row shows the item's kind, ticket, area path, status, priority, due date and urgency", (world) =>
  Effect.gen(function* () {
    const { projects, folders, add, inProgress } = world;
    const project = yield* projects.create("Billing");
    const folder = yield* folders.create(project.id, null, "dbo");
    const nested = yield* folders.create(project.id, folder.id, "Views");
    const item = yield* add(project.id, nested.id, "Fix invoice view", {
      ticketNumber: "INC-42",
      priorityLevelId: HIGH_PRIORITY_ID,
      dueDate: Temporal.PlainDate.from("2026-11-14"),
      dueTime: Temporal.PlainTime.from("09:30"),
    });

    const rows = yield* inProgress.load;

    expect(rows).toEqual([
      {
        itemId: item.id,
        projectId: project.id,
        folderId: nested.id,
        itemKind: "Todo",
        ticketNumber: "INC-42",
        title: "Fix invoice view",
        areaPath: "Billing › dbo › Views",
        statusName: "In progress",
        priorityName: "High",
        dueDate: "2026-11-14",
        dueTime: "09:30:00",
        urgency: "Imminent",
      },
    ]);
  }));

test("Only open, available items with a marked status are listed", (world) =>
  Effect.gen(function* () {
    const { projects, items, add, titles } = world;
    const project = yield* projects.create("Project");
    const gone = yield* projects.create("Gone");
    yield* add(project.id, null, "Working");
    yield* add(project.id, null, "Waiting", { statusId: QUEUED_STATUS_ID });
    const done = yield* add(project.id, null, "Done");
    const deleted = yield* add(project.id, null, "Deleted");
    yield* add(gone.id, null, "In a deleted project");
    yield* items.setCompleted(project.id, null, done.id, true);
    yield* items.delete(project.id, null, deleted.id);
    yield* projects.delete(gone.id);

    const listed = yield* titles;

    expect(listed).toEqual(["Working"]);
  }));

test("Every status marked In progress is listed, and unmarking one removes its items", (world) =>
  Effect.gen(function* () {
    const { projects, statuses, add, titles } = world;
    const project = yield* projects.create("Project");
    yield* add(project.id, null, "Coding");
    yield* add(project.id, null, "Checking", { statusId: TESTING_STATUS_ID });

    yield* statuses.setInProgress(TESTING_STATUS_ID, true);
    const both = yield* titles;
    yield* statuses.setInProgress(IN_PROGRESS_STATUS_ID, false);
    const testingOnly = yield* titles;

    expect(both).toEqual(["Checking", "Coding"]);
    expect(testingOnly).toEqual(["Checking"]);
  }));

test("Tickets are listed beside ToDos", ({ projects, add, inProgress, sql }) =>
  Effect.gen(function* () {
    const project = yield* projects.create("Project");
    const ticket = yield* add(project.id, null, "Outage report", { ticketNumber: "T-7" });
    yield* sql.withTransaction(
      sql`UPDATE TodoItem SET ItemKind = 'Ticket' WHERE Id = ${ticket.id}`,
    );

    const rows = yield* inProgress.load;

    expect(rows.map((row) => [row.itemKind, row.ticketNumber])).toEqual([["Ticket", "T-7"]]);
  }));

test("The stack is ordered by urgency, then priority, then deadline, then title", (world) =>
  Effect.gen(function* () {
    const { projects, add, titles } = world;
    const project = yield* projects.create("Project");
    const tomorrow = Temporal.PlainDate.from("2026-11-14");
    const nextWeek = Temporal.PlainDate.from("2026-11-20");
    yield* add(project.id, null, "b plain");
    yield* add(project.id, null, "a plain");
    yield* add(project.id, null, "high later", {
      priorityLevelId: HIGH_PRIORITY_ID,
      dueDate: nextWeek,
    });
    yield* add(project.id, null, "high", { priorityLevelId: HIGH_PRIORITY_ID });
    yield* add(project.id, null, "critical", { priorityLevelId: CRITICAL_PRIORITY_ID });
    yield* add(project.id, null, "due tomorrow", { dueDate: tomorrow });
    yield* add(project.id, null, "overdue", { dueDate: Temporal.PlainDate.from("2026-11-12") });

    const listed = yield* titles;

    expect(listed).toEqual([
      "overdue",
      "due tomorrow",
      "critical",
      "high later",
      "high",
      "a plain",
      "b plain",
    ]);
  }));
