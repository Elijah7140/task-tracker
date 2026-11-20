import { useAtomValue } from "@effect/atom-react";
import { Clock, Duration, Effect, Fiber } from "effect";
import { useEffect, useRef } from "react";
import { formatIsoDateInZone } from "../calendar/calendar-dates.js";
import { rendererClockAtom } from "../rpc/urgency-refresh.js";

/** How often Today checks the local date (§7.14). */
export const DAY_CHECK_INTERVAL = Duration.minutes(1);

function withClock<A>(effect: Effect.Effect<A>, clock: Clock.Clock | undefined) {
  return clock === undefined ? effect : effect.pipe(Effect.provideService(Clock.Clock, clock));
}

/**
 * Calls `onChange` when the local date in `timeZone` changes, checking every
 * minute on the renderer's Effect Clock and whenever the window is activated,
 * so a wall-clock change or a sleep across midnight is noticed (§7.14). A check
 * that finds the same date does nothing.
 */
export function useLocalDayChange(timeZone: string, onChange: () => void) {
  const clock = useAtomValue(rendererClockAtom);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const readDay = () =>
      formatIsoDateInZone(Effect.runSync(withClock(Clock.currentTimeMillis, clock)), timeZone);
    let checkedDay = readDay();
    const check = () => {
      const day = readDay();
      if (day !== checkedDay) {
        checkedDay = day;
        latest.current();
      }
    };
    const timer = Effect.sleep(DAY_CHECK_INTERVAL).pipe(
      Effect.andThen(Effect.sync(check)),
      Effect.forever,
    );
    const fiber = Effect.runFork(withClock(timer, clock));
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("focus", check);
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [clock, timeZone]);
}
