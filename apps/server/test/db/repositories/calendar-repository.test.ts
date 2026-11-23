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

test("Range includes due boundaries and leaves out undated items", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Before", { dueDate: "2026-10-31", dueTime: "23:45" });
    yield* seed(world, "First", { dueDate: "2026-11-01" });
    yield* seed(world, "Last", { dueDate: "2026-11-30", dueTime: "08:00" });
    yield* seed(world, "Outside", { dueDate: "2026-12-01" });
    yield* seed(world, "Undated", {});

    const entries = yield* load(range("2026-11-01", "2026-12-01"));

    expect(entries).toHaveLength(2);
    expect(titles(entries)).toEqual(["First", "Last"]);
  }));

test("Due date on the exclusive end date is excluded and the day before is included", (world) =>
  Effect.gen(function* () {
    yield* seed(world, "Last day", { dueDate: "2026-11-22" });
    yield* seed(world, "End date", { dueDate: "2026-11-23" });

    const entries = yield* load(range("2026-11-16", "2026-11-23"));

    expect(titles(entries)).toEqual(["Last day"]);
  }));

test("An item due in the range produces one entry at its due date and time", (world) =>
  Effect.gen(function* () {
    const item = yield* seed(world, "Timed", { dueDate: "2026-11-16", dueTime: "17:00" });

    const entries = yield* load(range("2026-11-16", "2026-11-17"));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ itemId: item.id, title: "Timed" });
    expect(entries[0]?.date.toString()).toBe("2026-11-16");
    expect(entries[0]?.startTime?.toString()).toBe("17:00:00");
    expect(entries[0]?.dueTime?.toString()).toBe("17:00:00");
  }));
