import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useCallback } from "react";
import { clockDate } from "../calendar/clock-date.js";
import { serverInfoAtom } from "../rpc/server-info-query.js";
import { rendererClockAtom } from "../rpc/urgency-refresh.js";

/**
 * Returns a function that reads today's date in the server's zone from the
 * renderer's Effect Clock, the same source the Calendar page uses. Reading it
 * on demand keeps a long-open editor correct after midnight.
 */
export function useReadToday(): () => string {
  const serverInfo = useAtomValue(serverInfoAtom);
  const timeZone = AsyncResult.isSuccess(serverInfo) ? serverInfo.value.timeZone : "UTC";
  const clock = useAtomValue(rendererClockAtom);
  return useCallback(() => clockDate(clock, timeZone), [clock, timeZone]);
}
