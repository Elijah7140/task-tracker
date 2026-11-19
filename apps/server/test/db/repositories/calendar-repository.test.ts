import { expect, it } from "@effect/vitest";
import type { CalendarEntry, CalendarQuery } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { calendarRepository } from "../../../src/db/repositories/calendar-repository.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { withSchema } from "../services/fixtures.js";

const services = Layer.mergeAll(ProjectService.layer("UTC"), ItemService.layer("UTC"));

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-11-16T12:00:00Z"));
  const items = yield* ItemService;
  const project = yield* (yield* ProjectService).create("Billing");
  return { items, project };
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
}

function editFields(title: string, fields: DateFields) {
  return {
    title,
    description: null,
    ticketNumber: null,
    itemTypeId: null,
    priorityLevelId: null,
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

/** Creates a root item in the project and sets its calendar fields. */
function seed(world: World, title: string, fields: DateFields) {
  return Effect.gen(function* () {
    const created = yield* world.items.create(world.project.id, null, null, title);
    yield* world.items.edit(created.id, editFields(title, fields));
    return created;
  });
}

function range(fromDate: string, toDateExclusive: string): CalendarQuery {
  return {
    projectId: null,
    fromDate: Temporal.PlainDate.from(fromDate),
    toDateExclusive: Temporal.PlainDate.from(toDateExclusive),
    includeCompleted: false,
  };
}

/** Reads entries through the repository in a fresh transaction. */
const load = (query: CalendarQuery) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(calendarRepository(sql).load(query));
  });

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

    const entries = yield* load(range("2026-11-01", "2026-12-01"));

    expect(entries).toHaveLength(4);
    expect(titles(entries)).toEqual(["First", "Last", "No end", "Spanning"]);
  }));

test("Due date on the exclusive end date is excluded and the day before is included", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Last day", { dueDate: "2026-11-22" });
    yield* seed(world, "End date", { dueDate: "2026-11-23" });

    const entries = yield* load(range("2026-11-16", "2026-11-23"));

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

    const entries = yield* load(range("2026-11-16", "2026-11-17"));

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

    const entries = yield* load(range("2026-11-16", "2026-11-17"));

    expect(titles(entries)).toEqual(["At midnight", "At noon"]);
  }));

test("Schedule without end reaching into the range by its default length is included", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Reaches in", { scheduledStart: "2026-11-15T23:45" });
    yield* seed(world, "Misses", { scheduledStart: "2026-11-15T23:29" });

    const entries = yield* load(range("2026-11-16", "2026-11-17"));

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

    const entries = yield* load(range("2026-11-16", "2026-11-17"));

    expect(titles(entries)).toEqual(["Ends after start", "Starts before end"]);
  }));

test("Item with a due date and a schedule produces both entries", (world) =>
  Effect.gen(function* () {
    const item = yield* seed(world, "Both", {
      dueDate: "2026-11-16",
      dueTime: "17:00",
      scheduledStart: "2026-11-16T09:00",
      scheduledEnd: "2026-11-16T10:00",
    });

    const entries = yield* load(range("2026-11-16", "2026-11-17"));

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

    const entries = yield* load(range("2026-11-16", "2026-11-23"));

    expect(entries.map((entry) => entry.kind)).toEqual(["due"]);
  }));

test("Item scheduled inside the range but due outside it returns only the scheduled entry", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Scheduled now", {
      dueDate: "2027-01-15",
      scheduledStart: "2026-11-18T09:00",
      scheduledEnd: "2026-11-18T10:00",
    });

    const entries = yield* load(range("2026-11-16", "2026-11-23"));

    expect(entries.map((entry) => entry.kind)).toEqual(["scheduled"]);
  }));
