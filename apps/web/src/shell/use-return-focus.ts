import { useCallback, useEffect, useRef } from "react";
import { useReturnPageStore } from "../state/return-page-store.js";
import { focusReturnTarget } from "./focus-return-target.js";
import { focusedOutsideMenuBar } from "./menu-bar-focus.js";

/**
 * Remembers what had focus when a covering page opened over the routed page,
 * and returns there after Back or Escape so focus never falls to the document
 * body. A page opened from the menu bar remembers what had focus before the
 * bar. Switching between covering pages keeps the first target. Call the
 * returned function just before hiding the covering page.
 */
export function useReturnFocus() {
  const previous = useRef<HTMLElement | null>(null);
  const restorePending = useRef(false);
  const covering = useReturnPageStore((state) => state.covering);

  useEffect(
    () =>
      useReturnPageStore.subscribe((state, prior) => {
        if (prior.covering === null && state.covering !== null) {
          previous.current = focusedOutsideMenuBar();
        }
      }),
    [],
  );

  useEffect(() => {
    if (covering !== null) {
      return;
    }
    if (restorePending.current) {
      focusReturnTarget(previous.current);
    }
    restorePending.current = false;
    previous.current = null;
  }, [covering]);

  return useCallback(() => {
    restorePending.current = true;
  }, []);
}
