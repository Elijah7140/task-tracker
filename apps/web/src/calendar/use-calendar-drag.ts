import type { CalendarReschedule } from "@task-tracker/contracts";
import { type PointerEvent, useRef, useState } from "react";
import { usePointerDrag } from "../ui/use-pointer-drag.js";
import type { CalendarDropTarget } from "./calendar-drop-target.js";
import { snapCalendarMinute } from "./calendar-drop-target.js";
import type { CalendarOccurrence } from "./calendar-layout.js";

type Request = typeof CalendarReschedule.Type;
type Point = Pick<MouseEvent, "clientX" | "clientY">;

/** Feedback for the currently accepted destination, indexed by day and zone. */
export interface CalendarDragFeedback {
  readonly target: CalendarDropTarget;
  readonly height: number;
}

function targetAt(point: Point, root: HTMLElement, grabOffset: number): CalendarDropTarget | null {
  const hit = document.elementFromPoint(point.clientX, point.clientY);
  const cell = hit?.closest<HTMLElement>("[data-calendar-drop-zone]");
  if (cell == null || !root.contains(cell)) {
    return null;
  }
  const date = cell.dataset["date"]!;
  const zone = cell.dataset["calendarDropZone"];
  if (zone === "time") {
    const minute = snapCalendarMinute(point.clientY - cell.getBoundingClientRect().top, grabOffset);
    return { type: "time", date, minute };
  }
  if (zone === "month" || zone === "all-day") {
    return { type: zone, date };
  }
  return null;
}

/** Bind calendar geometry to the shared pointer drag, including stationary-pointer scroll. */
export function useCalendarDrag(move: (request: Request) => void) {
  const start = usePointerDrag();
  const refresh = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState<CalendarDragFeedback | null>(null);

  const press = (
    event: PointerEvent<HTMLElement>,
    button: HTMLElement,
    occurrence: CalendarOccurrence,
  ) => {
    const root = event.currentTarget;
    const offset =
      button.closest("[data-calendar-drop-zone='time']") === null
        ? 0
        : event.clientY - button.getBoundingClientRect().top;
    const hit = (point: Point) => targetAt(point, root, offset);
    start(event, {
      focusOnPress: true,
      move: (point) => {
        refresh.current = () => {
          const target = hit(point);
          setFeedback(target === null ? null : { target, height: occurrence.heightPx });
        };
        setDragging(true);
        refresh.current();
      },
      drop: (point) => {
        const target = hit(point);
        if (target !== null) {
          move({ itemId: occurrence.entry.itemId, target });
        }
      },
      end: () => {
        refresh.current = null;
        setDragging(false);
        setFeedback(null);
      },
    });
  };

  return { press, dragging, feedback, refresh: () => refresh.current?.() };
}
