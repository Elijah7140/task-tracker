import { Effect, Exit, Scope } from "effect";
import { TestClock } from "effect/testing";
import { onTestFinished } from "vitest";

/**
 * A `TestClock` for renderer timers, closed when the test finishes. Advance it
 * with `advance` instead of waiting in real time.
 */
export function createTestClock() {
  const scope = Effect.runSync(Scope.make());
  const clock = Effect.runSync(
    TestClock.make({ warningDelay: "1 hour" }).pipe(Scope.provide(scope)),
  );
  onTestFinished(() => Effect.runPromise(Scope.close(scope, Exit.void)));
  return {
    clock,
    advance: (duration: Parameters<typeof clock.adjust>[0]) =>
      Effect.runPromise(clock.adjust(duration)),
    /** Moves the clock to an ISO instant, running any timers due by then. */
    setTime: (instant: string) => Effect.runPromise(clock.setTime(Date.parse(instant))),
  };
}
