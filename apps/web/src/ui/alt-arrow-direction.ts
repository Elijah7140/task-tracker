import type { KeyboardEvent } from "react";

/**
 * Reads Alt+ArrowUp (`-1`) or Alt+ArrowDown (`1`) pressed on the element that
 * owns the handler, ignoring keys that bubble from nested rows and inputs.
 */
export function altArrowDirection(event: KeyboardEvent<HTMLElement>): -1 | 1 | null {
  if (!event.altKey || event.target !== event.currentTarget) {
    return null;
  }
  if (event.key === "ArrowUp") {
    return -1;
  }
  return event.key === "ArrowDown" ? 1 : null;
}
