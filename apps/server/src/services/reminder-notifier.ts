import type { ReminderNotice } from "@task-tracker/core";
import { Context, Effect, Layer } from "effect";

/**
 * Posts one optional platform notification. The in-app panel is updated
 * separately, so a failure only loses the notification (§7.12).
 */
export class ReminderNotifier extends Context.Service<
  ReminderNotifier,
  { readonly notify: (notice: ReminderNotice) => Effect.Effect<void, unknown> }
>()("TaskTracker/ReminderNotifier") {
  /** Logs each notification. Native desktop notifications replace this (WP40). */
  static readonly logLayer = Layer.succeed(this)({
    notify: (notice) => Effect.logInfo(`Reminder: ${notice.title}`),
  });
}
