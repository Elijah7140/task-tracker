import { Effect, Layer } from "effect";
import { ReminderNotifier } from "../services/reminder-notifier.js";
import { ParentChannel } from "./parent-channel.js";

/**
 * Hands each notification to Electron main, which shows it natively (§7.12).
 * The server never imports Electron; main validates the message again.
 */
export const parentReminderNotifierLayer = Layer.effect(ReminderNotifier)(
  Effect.gen(function* () {
    const channel = yield* ParentChannel;
    return ReminderNotifier.of({
      notify: (notification) => channel.send({ type: "show-notification", notification }),
    });
  }),
);
