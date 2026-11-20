import { expect, it } from "@effect/vitest";
import type { DesktopToServerMessage } from "@task-tracker/contracts";
import { SettingsCatalogue } from "@task-tracker/core";
import { Effect, Layer, PubSub } from "effect";
import { desktopBridgeLayer } from "../../src/desktop/desktop-bridge.js";
import { ParentChannel } from "../../src/desktop/parent-channel.js";
import { ReminderScheduler } from "../../src/services/reminder-scheduler.js";
import { SettingsService } from "../../src/services/settings-service.js";
import { withSchema } from "../db/store.js";

type Outgoing = Parameters<ParentChannel["Service"]["send"]>[0];
type ParentCommand = typeof DesktopToServerMessage.Type;

/** An in-memory channel that records messages and lets a test send commands. */
const memoryChannel = Effect.gen(function* () {
  const sent: Outgoing[] = [];
  const commands = yield* PubSub.unbounded<ParentCommand>();
  const layer = Layer.succeed(ParentChannel)({
    send: (message) => Effect.sync(() => sent.push(message)),
    markReady: Effect.void,
    commands,
  });
  return { sent, commands, layer };
});

/** A scheduler that only counts requested checks. */
function countingScheduler() {
  const counter = { checks: 0 };
  const layer = Layer.succeed(ReminderScheduler)({
    requestCheck: Effect.sync(() => {
      counter.checks++;
    }),
    watch: () => Effect.never,
    snooze: () => Effect.void,
    dismiss: () => Effect.void,
  });
  return { counter, layer };
}

const settle = Effect.gen(function* () {
  for (let turn = 0; turn < 50; turn++) {
    yield* Effect.yieldNow;
  }
});

const bridge = (channel: Layer.Layer<ParentChannel>, scheduler: Layer.Layer<ReminderScheduler>) =>
  Layer.build(desktopBridgeLayer.pipe(Layer.provide(channel), Layer.provide(scheduler)));

it.effect("Announces the tray choice at startup and again only when a save changes it", () =>
  withSchema(
    Effect.scoped(
      Effect.gen(function* () {
        const channel = yield* memoryChannel;
        const settings = yield* SettingsService;
        yield* bridge(channel.layer, countingScheduler().layer);

        yield* settings.setGlobal(SettingsCatalogue.keepRunningInTray, true);
        yield* settle;
        yield* settings.setGlobal(SettingsCatalogue.autoCompleteParents, false);
        yield* settle;

        expect(channel.sent).toEqual([
          { type: "keep-running-in-tray", enabled: false },
          { type: "keep-running-in-tray", enabled: true },
        ]);
      }),
    ).pipe(Effect.provide(SettingsService.layer)),
  ),
);

it.effect("Requests a reminder check for each check command and leaves grants alone", () =>
  withSchema(
    Effect.scoped(
      Effect.gen(function* () {
        const channel = yield* memoryChannel;
        const scheduler = countingScheduler();
        yield* bridge(channel.layer, scheduler.layer);

        yield* PubSub.publish(channel.commands, { type: "check-reminders" });
        yield* PubSub.publish(channel.commands, {
          type: "transfer-file-grant",
          token: "A".repeat(43),
          path: "/home/user/export.json",
          access: "write",
        });
        yield* PubSub.publish(channel.commands, { type: "check-reminders" });
        yield* settle;

        expect(scheduler.counter.checks).toBe(2);
      }),
    ),
  ),
);
