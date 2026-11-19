import type { CalendarReschedule } from "@task-tracker/contracts";
import { DAY_MINUTES, PIXELS_PER_MINUTE } from "./calendar-metrics.js";

/** The calendar drop zones understood by both the view and the server. */
export type CalendarDropTarget = Exclude<typeof CalendarReschedule.Type.target, { type: "step" }>;

/** Snap the grabbed top edge to the nearest quarter-hour within the column's day. */
export function snapCalendarMinute(pointerY: number, grabOffset: number): number {
  const quarter = 15;
  const snapped = Math.round((pointerY - grabOffset) / (PIXELS_PER_MINUTE * quarter)) * quarter;
  return Math.min(DAY_MINUTES - quarter, Math.max(0, snapped));
}
