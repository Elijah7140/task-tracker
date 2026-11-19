import type { CalendarReschedule, Guid } from "@task-tracker/contracts";
import { Effect } from "effect";
import { Reactivity } from "effect/reactivity";
import { areaKey } from "./area-queries.js";
import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { LOOKUPS_KEY } from "./lookup-queries.js";
import { PROJECTS_KEY } from "./project-queries.js";
import { SETTINGS_KEY } from "./settings-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** Reactivity key for calendar queries and the one-minute urgency refresh. */
export const CALENDAR_KEY = "calendar";

/** Arguments for {@link calendarSnapshotAtom}. */
export interface CalendarQueryParams {
  readonly projectId: typeof Guid.Type | null;
  readonly fromDate: string;
  readonly toDateExclusive: string;
  readonly includeCompleted: boolean;
}

/** Calendar entries in the requested range with server-computed urgency and `today`. */
export const calendarSnapshotAtom = (params: CalendarQueryParams) =>
  TaskTrackerClient.query("LoadCalendar", params, {
    reactivityKeys: [CALENDAR_KEY, HISTORY_REPLAY_KEY, SETTINGS_KEY, LOOKUPS_KEY],
  });

/** Resolves an active item's current workspace folder before opening it from the calendar. */
export const locateCalendarItemAtom = TaskTrackerClient.mutation("LocateCalendarItem");

/** Commits a calendar move and invalidates the current area and history only after a write. */
export const makeRescheduleCalendarEntryAtom = () =>
  TaskTrackerClient.runtime.fn(
    Effect.fnUntraced(function* (request: typeof CalendarReschedule.Type) {
      const client = yield* TaskTrackerClient;
      const moved = yield* client("RescheduleCalendarEntry", request);
      if (moved !== null) {
        yield* Reactivity.invalidate([
          CALENDAR_KEY,
          areaKey(moved.projectId, moved.folderId),
          PROJECTS_KEY,
          HISTORY_KEY,
        ]);
      }
      return moved;
    }),
  );
