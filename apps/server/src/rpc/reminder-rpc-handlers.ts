import { ReminderRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { ReminderNotifier } from "../services/reminder-notifier.js";
import { ReminderScheduler } from "../services/reminder-scheduler.js";
import { ReminderService } from "../services/reminder-service.js";
import { mapOperationError } from "./map-operation-error.js";
import { projectReminderPanel } from "./reminder-projection.js";

/**
 * Bind the panel to the session's scheduler, which starts with the server and
 * checks reminders in `timeZone`. A notifier layer may replace the logging one.
 */
export const reminderRpcHandlers = (
  timeZone: string,
  notifier: Layer.Layer<ReminderNotifier> = ReminderNotifier.logLayer,
) =>
  ReminderRpcs.toLayer(
    Effect.gen(function* () {
      const scheduler = yield* ReminderScheduler;
      return ReminderRpcs.of({
        WatchReminders: ({ afterVersion }) =>
          scheduler.watch(afterVersion).pipe(Effect.map(projectReminderPanel), mapOperationError),
        SnoozeReminder: ({ itemId, instantUtc, option }) =>
          Effect.suspend(() =>
            scheduler.snooze(itemId, Temporal.Instant.from(instantUtc), option),
          ).pipe(mapOperationError),
        DismissReminder: ({ itemId }) => scheduler.dismiss(itemId).pipe(mapOperationError),
      });
    }),
  ).pipe(
    Layer.provide(ReminderScheduler.layer),
    Layer.provide(ReminderService.layer(timeZone)),
    Layer.provide(notifier),
  );
