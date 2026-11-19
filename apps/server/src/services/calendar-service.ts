import {
  EntityMissing,
  planCalendarMove,
  type CalendarMoveIntent,
  UrgencyThresholds,
  validateCalendarRange,
  type CalendarEntry,
  type CalendarQuery,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/sql";
import { calendarRepository } from "../db/repositories/calendar-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { readEffectiveSettings } from "./effective-settings-service.js";

import { checkRules } from "./check-rules.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const calendar = calendarRepository(sql);
  const items = itemRepository(sql);
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

  const reschedule = Effect.fnUntraced(function* (
    request: CalendarMoveIntent & { itemId: string },
  ) {
    const location = yield* calendar.locateItem(request.itemId);
    if (Option.isNone(location)) {
      return yield* Effect.fail(new EntityMissing("Item"));
    }
    const item = yield* items.requireActive(request.itemId);
    const move = yield* checkRules(() => planCalendarMove(item, request));
    if (move === null) {
      return null;
    }
    const updatedAtUtc = yield* operationTime;
    yield* undo.capture(undoLabel("Reschedule", item.title), [
      { table: "TodoItem", where: sql`Id = ${item.id}` },
    ]);
    yield* items.updateDates({ ...move.dates, id: item.id, updatedAtUtc });
    return { ...location.value, date: move.date.toString() };
  }, undo.record);

  return { load, locateItem, reschedule };
});

/** Loads scoped calendar entries with effective urgency thresholds and locates active items. */
export class CalendarService extends Context.Service<CalendarService>()(
  "@task-tracker/server/CalendarService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
