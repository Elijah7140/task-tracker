import {
  EntityMissing,
  UrgencyThresholds,
  validateCalendarRange,
  type CalendarEntry,
  type CalendarQuery,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/sql";
import { calendarRepository } from "../db/repositories/calendar-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { readEffectiveSettings } from "./effective-settings-service.js";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const calendar = calendarRepository(sql);
  const settings = settingsRepository(sql);

  const load = (query: CalendarQuery) =>
    sql.withTransaction(
      Effect.gen(function* () {
        yield* validateCalendarRange(query.fromDate, query.toDateExclusive);
        const entries = yield* calendar.load(query);
        if (entries.length === 0) {
          return entries;
        }
        const globals = yield* settings.global();
        const thresholdsByProject = new Map<string, UrgencyThresholds>();
        for (const projectId of new Set(entries.map((entry) => entry.projectId))) {
          const effective = yield* readEffectiveSettings(
            settings,
            projectId,
            Effect.succeed(globals),
          );
          thresholdsByProject.set(
            projectId,
            new UrgencyThresholds(
              effective.urgencyYellowThreshold.value,
              effective.urgencyRedThreshold.value,
            ),
          );
        }
        return entries.map((entry): CalendarEntry => ({
          ...entry,
          thresholds: thresholdsByProject.get(entry.projectId) ?? entry.thresholds,
        }));
      }),
    );

  const locateItem = (itemId: string) =>
    sql.withTransaction(
      calendar.locateItem(itemId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new EntityMissing("Item")),
            onSome: Effect.succeed,
          }),
        ),
      ),
    );

  return { load, locateItem };
});

/** Loads scoped calendar entries with effective urgency thresholds and locates active items. */
export class CalendarService extends Context.Service<CalendarService>()(
  "@task-tracker/server/CalendarService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
