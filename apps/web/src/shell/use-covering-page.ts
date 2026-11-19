import { useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { type CoveringPage, useReturnPageStore } from "../state/return-page-store.js";
import type { ReturnGuard } from "./return-guards.js";
import { useOpenCoveringPage } from "./use-open-covering-page.js";

function coveringPageShortcut(event: KeyboardEvent): CoveringPage | undefined {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
    return;
  }
  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key === "c") return "calendar";
    if (key === "t") return "trash";
  } else if (key === "f") {
    return "search";
  }
}

function isPlainEscape(event: KeyboardEvent) {
  return (
    event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
  );
}

/** An open list or menu popup handles its own Escape. A closed one can keep focus until it unmounts. */
function insideOpenPopup(target: EventTarget | undefined) {
  const popup = target instanceof Element ? target.closest("[role=listbox], [role=menu]") : null;
  return popup?.closest("[data-open]") != null;
}

function useCoveringPageKeys(open: (page: CoveringPage) => void, goBack: () => void) {
  const latest = useRef({ open, goBack });
  latest.current = { open, goBack };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || dialogStore.getState().queue.length > 0) {
        return;
      }
      const page = coveringPageShortcut(event);
      if (page !== undefined) {
        event.preventDefault();
        if (!event.repeat) {
          latest.current.open(page);
        }
      } else if (
        isPlainEscape(event) &&
        useReturnPageStore.getState().covering !== null &&
        !insideOpenPopup(event.composedPath()[0])
      ) {
        event.preventDefault();
        latest.current.goBack();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
}

/**
 * Handles keyboard shortcuts and Back for Search, Calendar and Trash. Returning
 * waits for the covering page to finish any changes and asks the return page’s
 * unsaved-changes guard if it needs a refresh.
 */
export function useCoveringPage(runGuards: ReturnGuard) {
  const open = useOpenCoveringPage();
  const href = useLocation({ select: (location) => location.href });
  const returning = useRef(false);

  const goBack = useCallback(async () => {
    const { busy, covering, stale } = useReturnPageStore.getState();
    if (returning.current || busy || covering === null) {
      return;
    }
    returning.current = true;
    try {
      if (!stale || (await runGuards())) {
        useReturnPageStore.getState().uncover();
      }
    } finally {
      returning.current = false;
    }
  }, [runGuards]);

  useEffect(() => {
    useReturnPageStore.getState().uncover();
  }, [href]);

  useCoveringPageKeys(open, () => void goBack());
  return { goBack };
}
