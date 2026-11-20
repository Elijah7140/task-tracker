import { Clock, Duration, Effect, Layer } from "effect";
import { Atom, Reactivity } from "effect/reactivity";

/** How often an open area asks the server for fresh urgency (§6.3). */
export const URGENCY_REFRESH_INTERVAL = Duration.minutes(1);

/**
 * The Effect Clock that renderer timers sleep on. Undefined keeps Effect's
 * live clock. Tests set a `TestClock` so they can advance time.
 */
export const rendererClockAtom = Atom.make<Clock.Clock | undefined>(undefined).pipe(Atom.keepAlive);

const timerRuntime = Atom.runtime((get) => {
  const clock = get(rendererClockAtom);
  return clock === undefined ? Layer.empty : Layer.succeed(Clock.Clock, clock);
});

const refreshEvery = (key: string) =>
  Effect.sleep(URGENCY_REFRESH_INTERVAL).pipe(
    Effect.andThen(Reactivity.invalidate([key])),
    Effect.forever,
  );

/**
 * While mounted, invalidates one reactivity key each minute so the queries
 * that carry it reload server-computed urgency. The renderer never computes
 * urgency itself.
 */
export const urgencyRefreshAtom = Atom.family((key: string) =>
  timerRuntime.atom(refreshEvery(key)),
);
