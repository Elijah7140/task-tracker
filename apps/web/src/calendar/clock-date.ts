import { Clock, Effect } from "effect";
import { formatIsoDateInZone } from "./calendar-dates.js";

/**
 * Today's `YYYY-MM-DD` date in `timeZone`, read from the renderer's Effect
 * Clock. An undefined clock reads Effect's live clock (§5.4).
 */
export function clockDate(clock: Clock.Clock | undefined, timeZone: string): string {
  const now = Clock.currentTimeMillis;
  const millis = Effect.runSync(
    clock === undefined ? now : now.pipe(Effect.provideService(Clock.Clock, clock)),
  );
  return formatIsoDateInZone(millis, timeZone);
}
