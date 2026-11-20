import { Clock, Duration, Effect } from "effect";

/**
 * How often the wall clock is compared with elapsed time. Legacy compared every
 * second; both clocks are read at the same moment, so a longer pulse only delays
 * the check by a few seconds and keeps long test-clock adjustments cheap.
 */
export const CLOCK_JUMP_PULSE = Duration.seconds(5);

/** A wall-clock change this far from the elapsed time counts as a clock change. */
const CLOCK_JUMP_TOLERANCE_NANOS = 250_000_000n;

/** The wall clock in milliseconds and the monotonic clock in nanoseconds, read together. */
export interface ClockReading {
  readonly wallMillis: number;
  readonly monotonicNanos: bigint;
}

const readClocks = Effect.all({
  wallMillis: Clock.currentTimeMillis,
  monotonicNanos: Clock.monotonicTimeNanos,
});

/**
 * Whether the wall clock moved differently from the time that really elapsed,
 * as after a manual clock change, a time sync or a resume from sleep where the
 * monotonic clock stood still.
 */
export function isClockJump(previous: ClockReading, next: ClockReading): boolean {
  const wallChange = BigInt(Math.round(next.wallMillis - previous.wallMillis)) * 1_000_000n;
  const elapsed = next.monotonicNanos - previous.monotonicNanos;
  const drift = wallChange - elapsed;
  return drift >= CLOCK_JUMP_TOLERANCE_NANOS || drift <= -CLOCK_JUMP_TOLERANCE_NANOS;
}

/**
 * Runs `onJump` soon after each wall-clock jump, checking every
 * {@link CLOCK_JUMP_PULSE} on Effect Clock. It never completes.
 */
export const watchClockJumps = <E, R>(onJump: Effect.Effect<void, E, R>) =>
  Effect.gen(function* () {
    let previous = yield* readClocks;
    for (;;) {
      yield* Effect.sleep(CLOCK_JUMP_PULSE);
      const next = yield* readClocks;
      if (isClockJump(previous, next)) {
        yield* onJump;
      }
      previous = next;
    }
  });
