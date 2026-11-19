import { AsyncResult } from "effect/reactivity";
import { type RefObject, useEffect, useState } from "react";
import { firstCalendarEntry } from "./calendar-grid-keys.js";

/** Where focus goes once a newly shown period has loaded. */
export type CalendarFocusRequest =
  /** After PageUp or PageDown: the first entry, else the button that repeats the step. */
  | { readonly kind: "period"; readonly fallbackTestId: "calendar-previous" | "calendar-next" }
  /** After "+N more": the opened day's first entry, else the first entry, else Next. */
  | { readonly kind: "day"; readonly date: string };

function focusTarget(
  page: HTMLElement,
  days: ReadonlyArray<string>,
  request: CalendarFocusRequest,
): HTMLElement | null {
  const entry = firstCalendarEntry(page, days, request.kind === "day" ? request.date : undefined);
  const fallback = request.kind === "period" ? request.fallbackTestId : "calendar-next";
  return entry ?? page.querySelector<HTMLElement>(`[data-testid="${fallback}"]`);
}

/**
 * Keeps keyboard focus in Calendar when a period change replaces the focused
 * control (§7.4). A request waits until the new period's entries have loaded,
 * then focuses the first entry or a period button.
 */
export function useCalendarFocus(
  pageRef: RefObject<HTMLElement | null>,
  result: AsyncResult.AsyncResult<unknown, unknown>,
  days: ReadonlyArray<string>,
) {
  const [request, setRequest] = useState<CalendarFocusRequest | null>(null);
  const loaded = !AsyncResult.isInitial(result) && !result.waiting;

  useEffect(() => {
    const page = pageRef.current;
    if (request === null || !loaded || page === null) {
      return;
    }
    setRequest(null);
    const target = focusTarget(page, days, request);
    target?.focus();
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [request, loaded, days, pageRef]);

  return setRequest;
}
