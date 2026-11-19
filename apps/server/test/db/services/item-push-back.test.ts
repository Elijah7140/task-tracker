import { expect, it } from "@effect/vitest";
import { EntityMissing, MetadataRuleError, recurrenceRule } from "@task-tracker/core";
import { Deferred, Effect, Fiber } from "effect";
import type { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { UndoService } from "../../../src/services/undo-service.js";
import { readItems } from "./fixtures.js";
import { editFields, type SearchServices, withSearchServices } from "./search-fixtures.js";

const due = Temporal.PlainDate.from("2026-11-10");
const dueTime = Temporal.PlainTime.from("15:30");
const start = due.toPlainDateTime("23:45");
const end = start.add({ hours: 2 });

interface StoredDates {
  readonly DueDate: string | null;
  readonly DueTime: string | null;
  readonly ScheduledStart: string | null;
  readonly ScheduledEnd: string | null;
  readonly RecurrenceFrequency: number | null;
  readonly RecurrenceRemaining: number | null;
  readonly UpdatedAtUtc: string;
}

const setup = (svc: SearchServices) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
    const project = yield* svc.projects.create("Project");
    const create = (title: string, parentId: string | null = null) =>
      svc.items.create(project.id, null, parentId, title);
    const read = (itemId: string) =>
      svc.sql<StoredDates>`SELECT DueDate, DueTime, ScheduledStart, ScheduledEnd,
          RecurrenceFrequency, RecurrenceRemaining, UpdatedAtUtc
        FROM TodoItem WHERE Id = ${itemId}`.pipe(
        svc.sql.withTransaction,
        Effect.map((rows) => rows[0]!),
      );
    return { projectId: project.id, create, read, undo: yield* UndoService };
  });

type World = Effect.Success<ReturnType<typeof setup>>;

const test = (
  name: string,
  body: (
    svc: SearchServices,
    world: World,
  ) => Effect.Effect<void, unknown, SqlClient.SqlClient | UndoService>,
) =>
  it.effect(name, () =>
    withSearchServices((svc) => Effect.flatMap(setup(svc), (world) => body(svc, world))),
  );

test("Push back shifts both floating dates and keeps the repeat rule and child dates", (svc, world) =>
  Effect.gen(function* () {
    const parent = yield* world.create("Overdue");
    const child = yield* world.create("Child", parent.id);
    const rule = recurrenceRule("Daily", { endKind: "AfterCount", remaining: 3 });
    yield* svc.items.edit(
      parent.id,
      editFields("Overdue", {
        dueDate: due,
        dueTime,
        scheduledStart: start,
        scheduledEnd: end,
        recurrence: rule,
      }),
    );
    yield* svc.items.edit(child.id, editFields("Child", { dueDate: due }));
    yield* TestClock.adjust("1 minute");

    yield* svc.items.pushBackOneDay(parent.id);

    expect(yield* world.read(parent.id)).toMatchObject({
      DueDate: "2026-11-11",
      DueTime: "15:30:00",
      ScheduledStart: "2026-11-11 23:45:00",
      ScheduledEnd: "2026-11-12 01:45:00",
      RecurrenceFrequency: 1,
      RecurrenceRemaining: 3,
      UpdatedAtUtc: "2026-11-13 12:01:00",
    });
    expect((yield* world.read(child.id)).DueDate).toBe("2026-11-10");
    expect((yield* world.undo.status()).undo).toBe("Push back 'Overdue'");

    yield* world.undo.apply("undo");

    expect(yield* world.read(parent.id)).toMatchObject({
      DueDate: "2026-11-10",
      ScheduledStart: "2026-11-10 23:45:00",
    });

    yield* world.undo.apply("redo");

    expect((yield* world.read(parent.id)).DueDate).toBe("2026-11-11");
  }));

test("Push back moves a scheduled block that has no due date", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Block");
    yield* svc.items.edit(item.id, editFields("Block", { scheduledStart: start }));

    yield* svc.items.pushBackOneDay(item.id);

    expect(yield* world.read(item.id)).toMatchObject({
      DueDate: null,
      ScheduledStart: "2026-11-11 23:45:00",
      ScheduledEnd: null,
    });
  }));

test("Push back rejects completed, undated and overflowing items without saving", (svc, world) =>
  Effect.gen(function* () {
    const undated = yield* world.create("Undated");
    const completed = yield* world.create("Completed");
    const overflow = yield* world.create("Overflow");
    yield* svc.items.edit(completed.id, editFields("Completed", { dueDate: due }));
    yield* svc.items.setCompleted(world.projectId, null, completed.id, true);
    const last = Temporal.PlainDate.from("9999-12-31");
    yield* svc.items.edit(
      overflow.id,
      editFields("Overflow", { dueDate: last, scheduledStart: start }),
    );
    const before = yield* readItems();

    const failures = yield* Effect.forEach([undated, completed, overflow], (item) =>
      Effect.flip(svc.items.pushBackOneDay(item.id)),
    );

    expect(failures).toEqual([
      new MetadataRuleError("This item has no due date or scheduled block."),
      new MetadataRuleError("Completed items cannot be pushed back."),
      new MetadataRuleError("Pushing back would move a date outside the supported calendar."),
    ]);
    expect(yield* readItems()).toEqual(before);
    expect((yield* world.undo.status()).undo).toBe("Edit 'Overflow'");
  }));

test("Push back refuses a deleted item", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Deleted");
    yield* svc.items.edit(item.id, editFields("Deleted", { dueDate: due }));
    yield* svc.items.delete(world.projectId, null, item.id);

    const failure = yield* Effect.flip(svc.items.pushBackOneDay(item.id));

    expect(failure).toEqual(new EntityMissing("Item"));
    expect((yield* world.read(item.id)).DueDate).toBe("2026-11-10");
  }));

test("A failed write rolls back the push back and records no step", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Report");
    yield* svc.items.edit(item.id, editFields("Report", { dueDate: due }));
    yield* svc.sql`CREATE TEMP TRIGGER fail_push_back BEFORE UPDATE OF DueDate ON TodoItem
      BEGIN SELECT RAISE(ABORT, 'date write failed'); END`;
    const before = yield* readItems();

    const failure = yield* Effect.flip(svc.items.pushBackOneDay(item.id));

    expect(String(failure)).toContain("date write failed");
    expect(yield* readItems()).toEqual(before);
    expect((yield* world.undo.status()).undo).toBe("Edit 'Report'");
  }));

test("An interrupted push back saves nothing and keeps the history", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Report");
    yield* svc.items.edit(item.id, editFields("Report", { dueDate: due }));
    const before = yield* readItems();
    const release = yield* Deferred.make<void>();
    const holder = yield* svc.sql
      .withTransaction(Deferred.await(release))
      .pipe(Effect.forkChild({ startImmediately: true }));

    const pushBack = yield* svc.items
      .pushBackOneDay(item.id)
      .pipe(Effect.forkChild({ startImmediately: true }));
    yield* Fiber.interrupt(pushBack);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(holder);

    expect(yield* readItems()).toEqual(before);
    expect((yield* world.undo.status()).undo).toBe("Edit 'Report'");
  }));
