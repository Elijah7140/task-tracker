import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { CurrentItemService } from "../../../src/services/current-item-service.js";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { TrashService } from "../../../src/services/trash-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "./fixtures.js";

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  FolderService.layer,
  ItemService.layer("UTC"),
  TrashService.layer,
  CurrentItemService.layer,
);

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-11-13T12:00:00Z"));
  const projects = yield* ProjectService;
  const folders = yield* FolderService;
  const items = yield* ItemService;
  const trash = yield* TrashService;
  const current = yield* CurrentItemService;
  const undo = yield* UndoService;
  const sql = yield* SqlClient.SqlClient;
  return { projects, folders, items, trash, current, undo, sql };
});

function test<A, E>(
  name: string,
  run: (world: Effect.Success<typeof setup>) => Effect.Effect<A, E, SqlClient.SqlClient>,
) {
  it.effect(name, () => setup.pipe(Effect.flatMap(run), Effect.provide(services), withSchema));
}

const HIGH_PRIORITY_ID = "019A0000-0000-7000-8000-000000000102";
const IN_PROGRESS_STATUS_ID = "019A0000-0000-7000-8000-000000000202";

/** Reads the stored setting text in its own transaction. */
const storedText = (sql: SqlClient.SqlClient) =>
  sql
    .withTransaction(
      sql<{ Value: string }>`SELECT Value FROM GlobalSetting WHERE Key = 'currentItemId'`,
    )
    .pipe(Effect.map((rows) => rows[0]?.Value));

test("No card is returned before an item is chosen", ({ current }) =>
  Effect.gen(function* () {
    const card = yield* current.load;

    expect(card).toBeNull();
  }));

test("The chosen item's card shows its title, area path and details", (world) =>
  Effect.gen(function* () {
    const { projects, folders, items, current } = world;
    const project = yield* projects.create("Billing");
    const folder = yield* folders.create(project.id, null, "dbo");
    const nested = yield* folders.create(project.id, folder.id, "Views");
    const item = yield* items.create(project.id, nested.id, null, "Fix invoice view");
    yield* items.edit(item.id, {
      title: "Fix invoice view",
      description: "Check the totals.",
      ticketNumber: null,
      itemTypeId: null,
      priorityLevelId: HIGH_PRIORITY_ID,
      dueDate: Temporal.PlainDate.from("2026-11-20"),
      dueTime: Temporal.PlainTime.from("14:30"),
      scheduledStart: null,
      scheduledEnd: null,
      statusId: IN_PROGRESS_STATUS_ID,
    });

    yield* current.set(item.id);

    const card = yield* current.load;
    expect(card).toEqual({
      itemId: item.id,
      projectId: project.id,
      folderId: nested.id,
      title: "Fix invoice view",
      areaPath: "Billing › dbo › Views",
      statusName: "In progress",
      priorityName: "High",
      dueDate: "2026-11-20",
      dueTime: "14:30:00",
      isCompleted: false,
      description: "Check the totals.",
    });
  }));

test("Clearing the choice leaves no current item", ({ projects, items, current }) =>
  Effect.gen(function* () {
    const project = yield* projects.create("Project");
    const item = yield* items.create(project.id, null, null, "Item");
    yield* current.set(item.id);

    yield* current.set(null);

    expect(yield* current.load).toBeNull();
  }));

test("A deleted current item is no longer returned and comes back when restored", (world) =>
  Effect.gen(function* () {
    const { projects, items, trash, current } = world;
    const project = yield* projects.create("Project");
    const item = yield* items.create(project.id, null, null, "Item");
    yield* current.set(item.id);

    const batchId = yield* items.delete(project.id, null, item.id);

    expect(yield* current.load).toBeNull();
    yield* trash.restore(batchId);
    expect((yield* current.load)?.itemId).toBe(item.id);
  }));

test("An item in a deleted project is treated as no current item", (world) =>
  Effect.gen(function* () {
    const { projects, items, current } = world;
    const project = yield* projects.create("Project");
    const item = yield* items.create(project.id, null, null, "Item");
    yield* current.set(item.id);

    yield* projects.delete(project.id);

    expect(yield* current.load).toBeNull();
  }));

test("A completed current item stays current and shows as completed", (world) =>
  Effect.gen(function* () {
    const { projects, items, current } = world;
    const project = yield* projects.create("Project");
    const item = yield* items.create(project.id, null, null, "Item");
    yield* current.set(item.id);

    yield* items.setCompleted(project.id, null, item.id, true);

    const card = yield* current.load;
    expect(card?.isCompleted).toBe(true);
    expect(card?.statusName).toBe("Completed");
  }));

test("Choosing a missing or deleted item is refused and keeps the previous choice", (world) =>
  Effect.gen(function* () {
    const { projects, items, current } = world;
    const project = yield* projects.create("Project");
    const kept = yield* items.create(project.id, null, null, "Kept");
    const deleted = yield* items.create(project.id, null, null, "Deleted");
    yield* items.delete(project.id, null, deleted.id);
    yield* current.set(kept.id);

    const missing = yield* Effect.flip(current.set("0193A1B2-0000-7000-8000-000000000999"));
    const removed = yield* Effect.flip(current.set(deleted.id));

    expect(missing.message).toBe("This item is no longer available.");
    expect(removed.message).toBe("This item is no longer available.");
    expect((yield* current.load)?.itemId).toBe(kept.id);
  }));

test("Choosing the current item records no undo step and is stored as legacy text", (world) =>
  Effect.gen(function* () {
    const { projects, items, current, undo, sql } = world;
    const project = yield* projects.create("Project");
    const item = yield* items.create(project.id, null, null, "Item");
    const before = yield* undo.status();

    yield* current.set(item.id);

    expect(yield* undo.status()).toEqual(before);
    expect(yield* storedText(sql)).toBe(item.id.toLowerCase());
    yield* current.set(null);
    expect(yield* storedText(sql)).toBe("");
  }));

test("Malformed stored text reads as no current item", ({ current, sql }) =>
  Effect.gen(function* () {
    yield* sql.withTransaction(
      sql`INSERT INTO GlobalSetting (Key, Value) VALUES ('currentItemId', 'not-a-guid')`,
    );

    const card = yield* current.load;

    expect(card).toBeNull();
  }));
