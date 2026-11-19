import type { Guid } from "@task-tracker/contracts";
import { HISTORY_REPLAY_KEY } from "./history-queries.js";
import { LOOKUPS_KEY } from "./lookup-queries.js";
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
