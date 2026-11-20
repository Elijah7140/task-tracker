import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";
import { makeNativeNotifier, NATIVE_RETRY_DELAY } from "../src/native-notifier.js";

const notification = {
  title: "Review invoices",
  body: "Operations",
  itemId: "019A0000-0000-7000-8000-000000000CCC",
};

/** A platform that fails a set number of times, then shows notifications. */
function flakyPlatform(failures = 0) {
  const state = { failuresLeft: failures, attempts: 0, delivered: 0 };
  const show = () => {
    state.attempts++;
    if (state.failuresLeft > 0) {
      state.failuresLeft--;
      throw new Error("The notification service is unavailable.");
    }
    state.delivered++;
  };
  return { state, show };
}

const runWithTestClock = <A>(effect: Effect.Effect<A>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestClock.layer())));

describe("makeNativeNotifier", () => {
  it("A failure pauses native notifications until the cool-down ends", async () => {
    const platform = flakyPlatform(1);
    const logged: string[] = [];
    const notifier = makeNativeNotifier(platform.show, (message) => logged.push(message));

    await runWithTestClock(
      Effect.gen(function* () {
        yield* notifier.notify(notification);
        yield* notifier.notify(notification);
        yield* TestClock.adjust(NATIVE_RETRY_DELAY);
        yield* notifier.notify(notification);
      }),
    );

    expect(platform.state).toEqual({ failuresLeft: 0, attempts: 2, delivered: 1 });
    expect(logged).toEqual([
      "Native reminders unavailable; retrying in 5 minutes: The notification service is unavailable.",
    ]);
  });

  it("A failure reported later by the platform also cools down", async () => {
    const platform = flakyPlatform();
    const notifier = makeNativeNotifier(platform.show, () => {});

    await runWithTestClock(
      Effect.gen(function* () {
        yield* notifier.reportFailure(new Error("No notification server."));
        yield* notifier.notify(notification);
        yield* TestClock.adjust(NATIVE_RETRY_DELAY);
        yield* notifier.notify(notification);
      }),
    );

    expect(platform.state.attempts).toBe(1);
  });

  it("Logs a repeated outage once, and again after delivery recovered", async () => {
    const platform = flakyPlatform(3);
    const logged: string[] = [];
    const notifier = makeNativeNotifier(platform.show, (message) => logged.push(message));

    await runWithTestClock(
      Effect.gen(function* () {
        yield* notifier.notify(notification);
        yield* TestClock.adjust(NATIVE_RETRY_DELAY);
        yield* notifier.notify(notification);
        yield* TestClock.adjust(NATIVE_RETRY_DELAY);
        yield* notifier.notify(notification);
        yield* TestClock.adjust(NATIVE_RETRY_DELAY);
        yield* notifier.notify(notification);
        yield* notifier.reportFailure(new Error("Lost the notification server."));
      }),
    );

    expect(platform.state.delivered).toBe(1);
    expect(logged).toHaveLength(2);
  });
});
