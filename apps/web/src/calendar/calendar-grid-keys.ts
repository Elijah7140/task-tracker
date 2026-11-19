import type { KeyboardEvent } from "react";

/**
 * Marks a focusable calendar control (an entry or "+N more") with its day and
 * its position in that day's display order, for arrow-key navigation.
 */
export function calendarNavProps(date: string, index: number) {
  return { "data-calendar-nav": "", "data-date": date, "data-nav-index": index } as const;
}

type Direction = "previous" | "next";

function controlsOf(grid: HTMLElement, date: string): Array<HTMLElement> {
  const selector = `[data-calendar-nav][data-date="${date}"]`;
  return [...grid.querySelectorAll<HTMLElement>(selector)].toSorted(
    (left, right) => Number(left.dataset["navIndex"]) - Number(right.dataset["navIndex"]),
  );
}

function withinDay(controls: ReadonlyArray<HTMLElement>, current: HTMLElement, step: number) {
  return controls[controls.indexOf(current) + step];
}

function acrossDays(
  grid: HTMLElement,
  days: ReadonlyArray<string>,
  current: HTMLElement,
  direction: Direction,
): HTMLElement | undefined {
  const date = current.dataset["date"] ?? "";
  const index = controlsOf(grid, date).indexOf(current);
  const step = direction === "next" ? 1 : -1;
  for (let day = days.indexOf(date) + step; day >= 0 && day < days.length; day += step) {
    const controls = controlsOf(grid, days[day]!);
    if (controls.length > 0) {
      return controls[Math.min(index, controls.length - 1)];
    }
  }
  return undefined;
}

function boundary(grid: HTMLElement, days: ReadonlyArray<string>, direction: Direction) {
  const all = days.flatMap((date) => controlsOf(grid, date));
  return direction === "next" ? all.at(-1) : all[0];
}

function target(
  grid: HTMLElement,
  days: ReadonlyArray<string>,
  current: HTMLElement,
  key: string,
): HTMLElement | undefined {
  const sameDay = controlsOf(grid, current.dataset["date"] ?? "");
  switch (key) {
    case "ArrowUp":
      return withinDay(sameDay, current, -1);
    case "ArrowDown":
      return withinDay(sameDay, current, 1);
    case "ArrowLeft":
      return acrossDays(grid, days, current, "previous");
    case "ArrowRight":
      return acrossDays(grid, days, current, "next");
    case "Home":
      return boundary(grid, days, "previous");
    case "End":
      return boundary(grid, days, "next");
    default:
      return undefined;
  }
}

function hasModifier(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

/**
 * Moves focus between calendar entries with plain arrow keys. Up and Down step
 * through one day's entries, Left and Right go to the nearest day with entries
 * (keeping the position where it can), and Home and End go to the first and
 * last entry shown. Keys with modifiers are left for rescheduling (§7.4).
 */
export function handleCalendarGridKey(
  event: KeyboardEvent<HTMLElement>,
  days: ReadonlyArray<string>,
) {
  const current = event.target;
  if (hasModifier(event) || !(current instanceof HTMLElement)) {
    return;
  }
  if (!current.hasAttribute("data-calendar-nav")) {
    return;
  }
  const next = target(event.currentTarget, days, current, event.key);
  if (next !== undefined) {
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  } else if (event.key.startsWith("Arrow")) {
    event.preventDefault();
  }
}
