import type { CalendarDragFeedback } from "./use-calendar-drag.js";
import { PIXELS_PER_MINUTE } from "./calendar-metrics.js";

/** Draws the snapped timed destination without affecting calendar layout or hit testing. */
export function CalendarDropGhost({ feedback }: { readonly feedback: CalendarDragFeedback }) {
  if (feedback.target.type !== "time") {
    return null;
  }
  const { minute } = feedback.target;
  const hour = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  return (
    <div
      data-testid="calendar-drop-ghost"
      aria-hidden="true"
      style={{ top: minute * PIXELS_PER_MINUTE, height: Math.max(12, feedback.height) }}
      className="pointer-events-none absolute inset-x-0.5 z-20 overflow-hidden rounded border border-accent bg-accent-soft/90 px-1 text-[10px] font-semibold leading-none text-accent-text"
    >
      {hour}:{minutes}
    </div>
  );
}
