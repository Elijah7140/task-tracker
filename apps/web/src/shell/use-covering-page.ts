import { useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import type { ReturnGuard } from "./return-guards.js";
import { useOpenTrash } from "./use-open-trash.js";

function isTrashShortcut(event: KeyboardEvent) {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "t"
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

function useCoveringPageKeys(openTrash: () => void, goBack: () => void) {
  const latest = useRef({ openTrash, goBack });
  latest.current = { openTrash, goBack };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || dialogStore.getState().queue.length > 0) {
        return;
      }
      if (isTrashShortcut(event)) {
        event.preventDefault();
        if (!event.repeat) {
          latest.current.openTrash();
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
 * Opens and leaves covering pages such as Trash. Ctrl+Shift+T opens Trash.
 * Back and Escape return unless a change is running. When something changed
 * the page behind, its unsaved-changes guard is asked once and Cancel stays.
 * Navigating elsewhere leaves the covering page.
 */
export function useCoveringPage(runGuards: ReturnGuard) {
  const openTrash = useOpenTrash();
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

  useCoveringPageKeys(openTrash, () => void goBack());
  return { openTrash, goBack };
}
