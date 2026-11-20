import { Effect, Layer, PubSub } from "effect";
import { ReminderScheduler } from "../services/reminder-scheduler.js";
import { SettingsService } from "../services/settings-service.js";
import { UndoService } from "../services/undo-service.js";
import { forEachParentCommand, ParentChannel } from "./parent-channel.js";

/**
 * Tells Electron main the `KeepRunningInTray` choice at startup and after each
 * commit that changes it, and runs a reminder check when main reports a resume
 * from sleep or the window gaining focus (§7.12).
 */
export const desktopBridgeLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const channel = yield* ParentChannel;
    const scheduler = yield* ReminderScheduler;
    const settings = yield* SettingsService;
    const undo = yield* UndoService;
    let announced: boolean | undefined;

    const announceTray = settings.loadKeepRunningInTray().pipe(
      Effect.flatMap((enabled) => {
        if (enabled === announced) {
          return Effect.void;
        }
        announced = enabled;
        return channel.send({ type: "keep-running-in-tray", enabled });
      }),
      Effect.catchCause((cause) => Effect.logWarning("Could not read the tray setting", cause)),
    );

    const commits = yield* PubSub.subscribe(undo.commits);
    yield* announceTray;
    yield* Effect.forkScoped(Effect.forever(Effect.andThen(PubSub.take(commits), announceTray)));
    // Transfer file grants share the pipe and are handled by the transfer services.
    yield* forEachParentCommand(channel, (message) =>
      message.type === "check-reminders" ? scheduler.requestCheck : Effect.void,
    );
  }),
).pipe(Layer.provide(SettingsService.layer));
