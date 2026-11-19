import type { ReminderChoice } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { ReminderService } from "../../../src/services/reminder-service.js";
import { SearchService } from "../../../src/services/search-service.js";
import { SettingsService } from "../../../src/services/settings-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "../store.js";
import { editFields } from "./search-fixtures.js";

/** The fixed moment reminder tests start at. */
export const START = Temporal.Instant.from("2026-11-17T12:00:00Z");

/** The services reminder tests use, sharing one database and history. */
export const reminderServices = Effect.gen(function* () {
  return {
    projects: yield* ProjectService,
    items: yield* ItemService,
    settings: yield* SettingsService,
    reminders: yield* ReminderService,
    search: yield* SearchService,
    undo: yield* UndoService,
    sql: yield* SqlClient.SqlClient,
  };
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      ProjectService.layer("UTC"),
      ItemService.layer("UTC"),
      SettingsService.layer,
      ReminderService.layer("UTC"),
      SearchService.layer,
    ),
  ),
);

/** Reminder test services. */
export type ReminderServices = Effect.Success<typeof reminderServices>;

/** Runs `body` on a fresh database with the test clock at {@link START}. */
export const withReminders = <A, E>(
  body: (svc: ReminderServices) => Effect.Effect<A, E, SqlClient.SqlClient | UndoService>,
) =>
  withSchema(
    Effect.gen(function* () {
      yield* TestClock.setTime(START.epochMilliseconds);
      return yield* Effect.flatMap(reminderServices, body);
    }),
  );

/** The test clock's current instant. */
export { operationTime as now } from "../../../src/services/operation-time.js";

/** At the due moment, the legacy tests' explicit choice. */
export const atDue: ReminderChoice = { kind: "offset", minutes: 0 };

/** Creates an item due at `due` in UTC with `reminder`, in `projectId`. */
export const saveDue = Effect.fnUntraced(function* (
  svc: ReminderServices,
  projectId: string,
  title: string,
  due: Temporal.Instant,
  reminder: ReminderChoice = atDue,
) {
  const item = yield* svc.items.create(projectId, null, null, title);
  const local = due.toZonedDateTimeISO("UTC");
  yield* svc.items.edit(
    item.id,
    editFields(title, {
      dueDate: local.toPlainDate(),
      dueTime: local.toPlainTime(),
      reminder,
    }),
  );
  return item;
});

/** Creates a date-only item due on `dueDate`. */
export const saveDateOnly = Effect.fnUntraced(function* (
  svc: ReminderServices,
  projectId: string,
  title: string,
  dueDate: Temporal.PlainDate,
) {
  const item = yield* svc.items.create(projectId, null, null, title);
  yield* svc.items.edit(item.id, editFields(title, { dueDate }));
  return item;
});

/** Reads an item's reminder columns through a fresh transaction. */
export const readReminderColumns = Effect.fnUntraced(function* (itemId: string) {
  const sql = yield* SqlClient.SqlClient;
  const [row] = yield* sql.withTransaction(
    sql<{
      ReminderMode: number | null;
      ReminderOffsetMinutes: number | null;
      ReminderDeliveredFor: string | null;
      SnoozedForUtc: string | null;
      SnoozedUntilUtc: string | null;
    }>`SELECT ReminderMode, ReminderOffsetMinutes,
      CAST(ReminderDeliveredFor AS TEXT) AS ReminderDeliveredFor,
      CAST(SnoozedForUtc AS TEXT) AS SnoozedForUtc,
      CAST(SnoozedUntilUtc AS TEXT) AS SnoozedUntilUtc
      FROM TodoItem WHERE Id = ${itemId}`,
  );
  return row!;
});

const unixEpochTicks = 621355968000000000n;

/** .NET ticks text for an instant, as the reminder columns store it. */
export const ticksText = (instant: Temporal.Instant) =>
  String(instant.epochNanoseconds / 100n + unixEpochTicks);
