import type { CalendarReschedule } from "@task-tracker/contracts";
import type { KeyboardEvent } from "react";

type Step = Extract<typeof CalendarReschedule.Type.target, { type: "step" }>;

/** Converts only unmodified Alt+arrow chords to relative calendar steps. */
export function calendarStep(event: KeyboardEvent): Step | undefined {
  if (
    !event.altKey ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.nativeEvent.isComposing
  ) {
    return undefined;
  }
  switch (event.key) {
    case "ArrowLeft":
      return { type: "step", days: -1, quarters: 0 };
    case "ArrowRight":
      return { type: "step", days: 1, quarters: 0 };
    case "ArrowUp":
      return { type: "step", days: 0, quarters: -1 };
    case "ArrowDown":
      return { type: "step", days: 0, quarters: 1 };
    default:
      return undefined;
  }
}
