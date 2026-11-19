import {
  EntityMissing,
  itemReminderBase,
  itemReminderInstant,
  largestReminderOffset,
  MetadataRuleError,
  reminderDueHorizon,
  resolveReminderSettings,
  snoozeUntil,
  type ReminderSnooze,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/sql";
import { itemRepository } from "../db/repositories/item-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import {
  type DuePage,
  type ReminderEntry,
  reminderRepository,
} from "../db/repositories/reminder-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

const unavailable = () => new MetadataRuleError("This item is no longer available.");
const changed = () => new MetadataRuleError("This reminder has changed.");

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const reminders = reminderRepository(sql);
  const items = itemRepository(sql);
  const projects = projectRepository(sql);
  const settings = settingsRepository(sql);

  const window = Effect.fnUntraced(function* (now: Temporal.Instant) {
    const largest = largestReminderOffset(yield* reminders.storedDefaultOffsets());
    return { now, timeZone, horizon: reminderDueHorizon(now, timeZone, largest) };
  });

  const due = Effect.fnUntraced(function* (now: Temporal.Instant, page: DuePage = {}) {
    return yield* reminders.due(yield* window(now), page);
  }, sql.withTransaction);

  const delivered = Effect.fnUntraced(function* (itemIds: readonly string[]) {
    return yield* reminders.delivered(yield* window(yield* operationTime), itemIds);
  }, sql.withTransaction);

  const nextInstant = Effect.fnUntraced(function* (now: Temporal.Instant) {
    return yield* reminders.nextInstant(yield* window(now));
  }, sql.withTransaction);

  const recordDelivery = Effect.fnUntraced(function* (entries: readonly ReminderEntry[]) {
    for (const { itemId, instant } of entries) {
      yield* reminders.recordDelivery({ itemId, instant });
    }
  }, sql.withTransaction);

  const requireItem = (itemId: string) =>
    items.requireActive(itemId).pipe(
      Effect.catchIf(
        (error) => error instanceof EntityMissing,
        () => Effect.fail(unavailable()),
      ),
    );

  /** The item's current base instant, refusing unless `instant` is its delivered instant. */
  const requireDelivered = Effect.fnUntraced(function* (itemId: string, instant: Temporal.Instant) {
    const item = yield* requireItem(itemId);
    const project = yield* projects.findActive(item.projectId);
    if (Option.isNone(project)) {
      return yield* Effect.fail(unavailable());
    }
    const effective = resolveReminderSettings(
      yield* settings.global(),
      yield* settings.project(item.projectId),
    );
    const base = itemReminderBase(item, effective, timeZone);
    const state = yield* reminders.state(item.id);
    const current = Option.isSome(state) ? itemReminderInstant(base, state.value) : null;
    const deliveredFor = Option.isSome(state) ? state.value.deliveredFor : null;
    if (
      base === null ||
      current === null ||
      !current.equals(instant) ||
      !deliveredFor?.equals(instant)
    ) {
      return yield* Effect.fail(changed());
    }
    return { item, base, effective };
  });

  /** Defers a delivered reminder as a labelled undo step (§7.12). */
  const snooze = Effect.fnUntraced(function* (
    itemId: string,
    instant: Temporal.Instant,
    option: ReminderSnooze,
  ) {
    const { item, base, effective } = yield* requireDelivered(itemId, instant);
    const now = yield* operationTime;
    const until = snoozeUntil(option, now, timeZone, effective.dateOnlyReminderTime.value);
    yield* undo.capture(undoLabel("Snooze reminder for", item.title), [
      { table: "TodoItem", where: sql`Id = ${item.id}` },
    ]);
    yield* reminders.snooze({
      itemId: item.id,
      snoozedForUtc: base,
      snoozedUntilUtc: until,
      now,
    });
  }, undo.record);

  return {
    /** One page of reminders due at `now`, newest first. Each read is its own transaction. */
    due,
    /** The given items whose current instant was delivered and has not changed since. */
    delivered,
    /** The earliest undelivered reminder instant after `now`, or null when none is near. */
    nextInstant,
    /** Records delivery without touching undo history (§7.8). */
    recordDelivery,
    snooze,
  };
});

/** Due-reminder reads, delivery bookkeeping and snoozes in the server zone (§7.12). */
export class ReminderService extends Context.Service<ReminderService>()(
  "@task-tracker/server/ReminderService",
  { make },
) {
  static readonly layer = (timeZone: string) => Layer.effect(this, make(timeZone));
}
