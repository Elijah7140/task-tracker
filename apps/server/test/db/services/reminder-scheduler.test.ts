import { expect, it } from "@effect/vitest";
import type { ReminderNotice } from "@task-tracker/core";
import { Effect, Exit, Fiber, Layer, Scope } from "effect";
import type { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { ReminderNotifier } from "../../../src/services/reminder-notifier.js";
import { ReminderScheduler } from "../../../src/services/reminder-scheduler.js";
import { ReminderService } from "../../../src/services/reminder-service.js";
import type { UndoService } from "../../../src/services/undo-service.js";
import { now, type ReminderServices, saveDue, START, withReminders } from "./reminder-fixtures.js";

interface CaptureOptions {
  readonly fails?: boolean;
}

/** Records notifications, optionally failing each one after recording it. */
function captureNotifier(options: CaptureOptions = {}) {
  const notices: ReminderNotice[] = [];
  const layer = Layer.succeed(ReminderNotifier)({
    notify: (notice) =>
      Effect.suspend(() => {
        notices.push(notice);
        return options.fails === true
          ? Effect.fail(new Error("The notification service is unavailable."))
          : Effect.void;
      }),
  });
  return { notices, layer };
}

/** Lets forked scheduler fibers run until `ready` holds. */
const settle = (ready: () => boolean = () => false) =>
  Effect.gen(function* () {
    for (let turn = 0; turn < 200 && !ready(); turn++) {
      yield* Effect.yieldNow;
    }
  });

/** Starts a scheduler in its own scope, so a test can stop it like an app shutdown. */
const startScheduler = Effect.fnUntraced(function* (
  notifier: Layer.Layer<ReminderNotifier>,
  service?: Layer.Layer<ReminderService, never, SqlClient.SqlClient | UndoService>,
) {
  const scope = yield* Scope.make();
  const layer = ReminderScheduler.layer.pipe(
    Layer.provide(service ?? ReminderService.layer("UTC")),
    Layer.provide(notifier),
  );
  const context = yield* Layer.buildWithScope(layer, scope);
  yield* settle();
  return {
    scheduler: context.mapUnsafe.get(ReminderScheduler.key) as ReminderScheduler["Service"],
    stop: Scope.close(scope, Exit.void),
  };
});

const project = (svc: ReminderServices, name: string) => svc.projects.create(name);

const panelTitles = (scheduler: ReminderScheduler["Service"]) =>
  scheduler.watch(-1).pipe(Effect.map((panel) => panel.reminders.map((entry) => entry.title)));

it.effect("The thirty-second tick delivers a due reminder once", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const ops = yield* project(svc, "Operations");
      const item = yield* saveDue(svc, ops.id, "Minutes", START.add({ seconds: 15 }));
      const capture = captureNotifier();
      yield* startScheduler(capture.layer);

      yield* TestClock.adjust("29 seconds");
      yield* settle();
      expect(capture.notices).toEqual([]);
      yield* TestClock.adjust("1 second");
      yield* settle(() => capture.notices.length > 0);

      expect(capture.notices.map((notice) => notice.itemId)).toEqual([item.id]);
      yield* TestClock.adjust("30 seconds");
      yield* settle();
      expect(capture.notices).toHaveLength(1);
    }),
  ),
);

it.effect("A save checks immediately and catches a newly due item", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const capture = captureNotifier();
      yield* startScheduler(capture.layer);
      const ops = yield* project(svc, "Operations");

      const item = yield* saveDue(svc, ops.id, "Due now", yield* now);
      yield* settle(() => capture.notices.length > 0);

      expect(capture.notices).toEqual([{ title: "Due now", body: "Operations", itemId: item.id }]);
      expect(yield* svc.reminders.due(yield* now)).toEqual([]);
    }),
  ),
);

it.effect("Startup groups the last twenty-four hours and records older reminders silently", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const ops = yield* project(svc, "Operations");
      yield* saveDue(svc, ops.id, "Old", START.subtract({ hours: 24, milliseconds: 1 }));
      yield* saveDue(svc, ops.id, "Boundary", START.subtract({ hours: 24 }));
      yield* saveDue(svc, ops.id, "Recent", START.subtract({ minutes: 1 }));
      const capture = captureNotifier();

      const { scheduler } = yield* startScheduler(capture.layer);

      expect(capture.notices).toEqual([
        {
          title: "2 reminders while you were away",
          body: "Open Task Tracker to see your reminders.",
          itemId: null,
        },
      ]);
      expect(yield* panelTitles(scheduler)).toEqual(["Recent", "Boundary"]);
      expect(yield* svc.reminders.due(START)).toEqual([]);
    }),
  ),
);

it.effect("A live check groups recent reminders and records older ones silently", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const capture = captureNotifier();
      const { scheduler } = yield* startScheduler(capture.layer);
      const ops = yield* project(svc, "Operations");

      // One transaction stands in for an import: every row commits before the check.
      yield* svc.sql.withTransaction(
        Effect.gen(function* () {
          for (let day = 2; day <= 6; day++) {
            yield* saveDue(svc, ops.id, `Imported ${day}`, START.subtract({ hours: 24 * day }));
          }
          yield* saveDue(svc, ops.id, "Recent", START.subtract({ minutes: 5 }));
          yield* saveDue(svc, ops.id, "Now", START);
        }),
      );
      yield* settle(() => capture.notices.length > 0);
      yield* settle();

      expect(capture.notices.map((notice) => notice.title)).toEqual(["2 reminders due"]);
      expect(capture.notices[0]?.itemId).toBeNull();
      expect(yield* panelTitles(scheduler)).toEqual(["Now", "Recent"]);
      expect(yield* svc.reminders.due(START)).toEqual([]);
    }),
  ),
);

it.effect("A failed discard of old reminders still notifies only recent ones", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const ops = yield* project(svc, "Operations");
      for (let day = 2; day <= 6; day++) {
        yield* saveDue(svc, ops.id, `Old ${day}`, START.subtract({ hours: 24 * day }));
      }
      yield* saveDue(svc, ops.id, "Recent", START.subtract({ minutes: 5 }));
      let failuresLeft = 1;
      const failingOnce = Layer.effect(ReminderService)(
        Effect.gen(function* () {
          const real = yield* ReminderService;
          return {
            ...real,
            recordDelivery: (entries: Parameters<typeof real.recordDelivery>[0]) =>
              failuresLeft-- > 0
                ? Effect.die(new Error("The database refused the write."))
                : real.recordDelivery(entries),
          };
        }),
      ).pipe(Layer.provide(ReminderService.layer("UTC")));
      const capture = captureNotifier();

      yield* startScheduler(capture.layer, failingOnce);
      yield* TestClock.adjust("30 seconds");
      yield* settle();

      expect(capture.notices.map((notice) => notice.title)).toEqual([
        "1 reminder while you were away",
      ]);
      expect(yield* svc.reminders.due(yield* now)).toEqual([]);
    }),
  ),
);

it.effect("Stopping the scheduler stops delivery of a requested check", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const capture = captureNotifier();
      const { stop } = yield* startScheduler(capture.layer);
      yield* stop;
      const ops = yield* project(svc, "Operations");

      yield* saveDue(svc, ops.id, "Due now", START);
      yield* TestClock.adjust("1 minute");
      yield* settle();

      expect(capture.notices).toEqual([]);
      expect(yield* svc.reminders.due(yield* now)).toHaveLength(1);
    }),
  ),
);

it.effect("A failing notifier is not called again for the same reminder", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const capture = captureNotifier({ fails: true });
      const { scheduler } = yield* startScheduler(capture.layer);
      const ops = yield* project(svc, "Operations");

      yield* saveDue(svc, ops.id, "Due now", START);
      yield* settle(() => capture.notices.length > 0);
      yield* TestClock.adjust("30 seconds");
      yield* settle();

      expect(capture.notices).toHaveLength(1);
      expect(yield* panelTitles(scheduler)).toEqual(["Due now"]);
    }),
  ),
);

it.effect("A restart does not deliver a reminder again", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const ops = yield* project(svc, "Operations");
      yield* saveDue(svc, ops.id, "Due now", START);
      const capture = captureNotifier();
      const first = yield* startScheduler(capture.layer);
      yield* first.stop;

      yield* startScheduler(capture.layer);
      yield* TestClock.adjust("30 seconds");
      yield* settle();

      expect(capture.notices).toHaveLength(1);
    }),
  ),
);

it.effect("Snoozing removes the entry and undoing the snooze restores it", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const ops = yield* project(svc, "Operations");
      const item = yield* saveDue(svc, ops.id, "Snoozed task", START);
      const capture = captureNotifier();
      const { scheduler } = yield* startScheduler(capture.layer);
      const shown = yield* scheduler.watch(-1);

      yield* scheduler.snooze(item.id, START, "oneHour");

      const snoozed = yield* scheduler.watch(shown.version);
      expect(snoozed.reminders).toEqual([]);
      expect(yield* svc.reminders.due(yield* now)).toEqual([]);
      yield* svc.undo.apply("undo");
      const restored = yield* scheduler.watch(snoozed.version);
      expect(restored.reminders.map((entry) => entry.instant.toString())).toEqual([
        START.toString(),
      ]);
    }),
  ),
);

it.effect("Dismissing removes the entry for the rest of the session", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const ops = yield* project(svc, "Operations");
      const item = yield* saveDue(svc, ops.id, "Dismissed", START);
      const capture = captureNotifier();
      const { scheduler } = yield* startScheduler(capture.layer);

      yield* scheduler.dismiss(item.id.toLowerCase());
      yield* scheduler.requestCheck;
      yield* settle();

      expect(yield* panelTitles(scheduler)).toEqual([]);
      expect(yield* svc.reminders.due(yield* now)).toEqual([]);
    }),
  ),
);

it.effect("Completing an item removes its entry from the panel", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const ops = yield* project(svc, "Operations");
      const item = yield* saveDue(svc, ops.id, "Finish me", START);
      const capture = captureNotifier();
      const { scheduler } = yield* startScheduler(capture.layer);
      const shown = yield* scheduler.watch(-1);

      yield* svc.items.setCompleted(ops.id, null, item.id, true);

      const after = yield* scheduler.watch(shown.version);
      expect(after.reminders).toEqual([]);
    }),
  ),
);

it.effect("Watching waits until the panel changes", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const capture = captureNotifier();
      const { scheduler } = yield* startScheduler(capture.layer);
      const empty = yield* scheduler.watch(-1);
      const waiting = yield* Effect.forkChild(scheduler.watch(empty.version));
      yield* settle();
      expect(waiting.pollUnsafe()).toBeUndefined();
      const ops = yield* project(svc, "Operations");

      yield* saveDue(svc, ops.id, "Arrives", START);

      const panel = yield* Fiber.await(waiting);
      expect(Exit.isSuccess(panel) && panel.value.reminders.map((entry) => entry.title)).toEqual([
        "Arrives",
      ]);
    }),
  ),
);

it.effect(
  "A periodic check finds a reminder written outside recorded operations within an hour",
  () =>
    withReminders((svc) =>
      Effect.gen(function* () {
        const ops = yield* project(svc, "Operations");
        const item = yield* svc.items.create(ops.id, null, null, "Imported");
        const capture = captureNotifier();
        yield* startScheduler(capture.layer);

        yield* svc.sql`UPDATE TodoItem SET DueDate = '2026-11-17', DueTime = '12:00:00',
        ReminderMode = 2, ReminderOffsetMinutes = 0 WHERE Id = ${item.id}`;
        yield* TestClock.adjust("1 hour");
        yield* settle(() => capture.notices.length > 0);

        expect(capture.notices.map((notice) => notice.itemId)).toEqual([item.id]);
      }),
    ),
);
