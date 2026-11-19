import { useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import type { ReturnGuard } from "./return-guards.js";
import { useOpenCalendar } from "./use-open-calendar.js";
import { useOpenTrash } from "./use-open-trash.js";

function isShiftShortcut(event: KeyboardEvent, key: string) {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === key
  );
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

function useCoveringPageKeys(openTrash: () => void, openCalendar: () => void, goBack: () => void) {
  const latest = useRef({ openTrash, openCalendar, goBack });
  latest.current = { openTrash, openCalendar, goBack };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || dialogStore.getState().queue.length > 0) {
        return;
      }
      if (isShiftShortcut(event, "t")) {
        event.preventDefault();
        if (!event.repeat) {
          latest.current.openTrash();
        }
      } else if (isShiftShortcut(event, "c")) {
        event.preventDefault();
        if (!event.repeat) {
          latest.current.openCalendar();
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
 * Opens and leaves covering pages such as Trash and Calendar. Ctrl+Shift+T opens
 * Trash and Ctrl+Shift+C opens Calendar. Back and Escape return unless a change
 * is running. When something changed the page behind, its unsaved-changes guard
 * is asked once and Cancel stays. Navigating elsewhere leaves the covering page.
 */
export function useCoveringPage(runGuards: ReturnGuard) {
  const openTrash = useOpenTrash();
  const openCalendar = useOpenCalendar();
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

  useCoveringPageKeys(openTrash, openCalendar, () => void goBack());
  return { openTrash, openCalendar, goBack };
}
