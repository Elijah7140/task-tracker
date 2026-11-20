import {
  recentReminderCutoff,
  reminderNotification,
  type ReminderSnooze,
} from "@task-tracker/core";
import { Context, Duration, Effect, Layer, PubSub, Queue } from "effect";
import type { ReminderEntry } from "../db/repositories/reminder-repository.js";
import { watchClockJumps } from "./clock-jump.js";
import { operationTime } from "./operation-time.js";
import { makeReminderPanel } from "./reminder-panel.js";
import { ReminderNotifier } from "./reminder-notifier.js";
import { ReminderService } from "./reminder-service.js";
import { UndoService } from "./undo-service.js";

/** How often the scheduler checks without another trigger (§7.12). */
export const REMINDER_CHECK_INTERVAL = Duration.seconds(30);

const earliest = (left: Temporal.Instant | null, right: Temporal.Instant) =>
  left !== null && Temporal.Instant.compare(left, right) < 0 ? left : right;

const deliveryKey = (entry: ReminderEntry) => `${entry.itemId}:${entry.instant.toString()}`;

const make = Effect.gen(function* () {
  const service = yield* ReminderService;
  const notifier = yield* ReminderNotifier;
  const undo = yield* UndoService;
  const panel = yield* makeReminderPanel;
  const requests = yield* Queue.sliding<void>(1);
  /** Reminders notified whose delivery is not yet recorded, so a retry never notifies twice. */
  const notified = new Set<string>();
  /** A periodic tick before this moment has nothing to deliver and skips the database. */
  let quietUntil: Temporal.Instant | null = null;

  /** Records reminders older than the window silently, a batch at a time. */
  const discardOlder = (now: Temporal.Instant, cutoff: Temporal.Instant) =>
    Effect.gen(function* () {
      for (;;) {
        const batch = yield* service.due(now, { before: cutoff });
        if (batch.length === 0) {
          return;
        }
        yield* service.recordDelivery(batch);
      }
    });

  /** Every reminder due within the window, newest first. */
  const readRecent = (now: Temporal.Instant, cutoff: Temporal.Instant) =>
    Effect.gen(function* () {
      const recent: ReminderEntry[] = [];
      for (;;) {
        const batch = yield* service.due(now, { since: cutoff, offset: recent.length });
        if (batch.length === 0) {
          return recent;
        }
        recent.push(...batch);
      }
    });

  const notify = (entries: readonly ReminderEntry[], startup: boolean) =>
    Effect.gen(function* () {
      if (entries.every((entry) => notified.has(deliveryKey(entry)))) {
        return;
      }
      yield* notifier
        .notify(reminderNotification(entries, startup))
        .pipe(
          Effect.catchCause((cause) => Effect.logWarning("Reminder notification failed", cause)),
        );
      entries.forEach((entry) => notified.add(deliveryKey(entry)));
    });

  const deliver = (entries: readonly ReminderEntry[], startup: boolean) =>
    Effect.gen(function* () {
      yield* notify(entries, startup);
      yield* service.recordDelivery(entries);
      entries.forEach((entry) => notified.delete(deliveryKey(entry)));
      yield* panel.add(entries);
    });

  /**
   * Records reminders older than 24 hours silently, then notifies the recent ones.
   * The recent read is bounded by the window, so a failed discard never floods.
   */
  const check = (startup: boolean) =>
    Effect.gen(function* () {
      const now = yield* operationTime;
      const cutoff = recentReminderCutoff(now);
      const discarded = yield* discardOlder(now, cutoff).pipe(
        Effect.as(true),
        Effect.catchCause((cause) =>
          Effect.as(
            Effect.logWarning("Old reminders were not recorded; the next check retries", cause),
            false,
          ),
        ),
      );
      const recent = yield* readRecent(now, cutoff);
      if (recent.length > 0) {
        yield* deliver(recent, startup);
      }
      yield* panel.reconcile(yield* service.delivered(panel.knownItemIds()));
      quietUntil = discarded
        ? earliest(yield* service.nextInstant(now), now.add({ hours: 1 }))
        : null;
    }).pipe(
      Effect.catchCause((cause) => {
        quietUntil = null;
        return Effect.logError("Reminder check failed", cause);
      }),
    );

  /**
   * A periodic tick checks once the next known instant may have passed. Commits
   * always check, and an idle tick still checks at least hourly, so a change
   * made outside recorded operations is found.
   */
  const tick = Effect.gen(function* () {
    const now = yield* operationTime;
    if (quietUntil === null || Temporal.Instant.compare(now, quietUntil) >= 0) {
      yield* check(false);
    }
  });

  const requestCheck = Queue.offer(requests, undefined).pipe(Effect.asVoid);

  const run = Effect.gen(function* () {
    yield* check(true);
    for (;;) {
      const requested = yield* Effect.raceFirst(
        Effect.as(Effect.sleep(REMINDER_CHECK_INTERVAL), false),
        Effect.as(Queue.take(requests), true),
      );
      yield* requested ? check(false) : tick;
    }
  });

  const commits = yield* PubSub.subscribe(undo.commits);
  yield* Effect.forkScoped(Effect.forever(Effect.andThen(PubSub.take(commits), requestCheck)));
  yield* Effect.forkScoped(run);
  yield* Effect.forkScoped(watchClockJumps(requestCheck));

  return {
    /** Checks soon, as after a save, a resume from sleep or a clock change. */
    requestCheck,
    /** The panel once its version differs from `afterVersion`. */
    watch: panel.watch,
    /** Snoozes a delivered reminder and removes it from the panel. */
    snooze: (itemId: string, instant: Temporal.Instant, option: ReminderSnooze) =>
      service
        .snooze(itemId, instant, option)
        .pipe(Effect.andThen(panel.remove(itemId.toUpperCase(), false))),
    /** Removes a reminder from this session's panel. Stored data is untouched (§7.8). */
    dismiss: (itemId: string) => panel.remove(itemId.toUpperCase(), true),
  };
});

/**
 * Delivers reminders on Effect Clock: once at startup, every 30 seconds, soon
 * after each committed change and soon after a wall-clock jump. Checks run one
 * at a time in a scoped fiber (§7.12).
 */
export class ReminderScheduler extends Context.Service<ReminderScheduler>()(
  "@task-tracker/server/ReminderScheduler",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
