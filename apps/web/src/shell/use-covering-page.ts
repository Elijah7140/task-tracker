import { useCallback, useEffect, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import {
  type CoveringPage,
  settleReturnPageWrites,
  useReturnPageStore,
} from "../state/return-page-store.js";
import { findShortcut, matchesShortcut, type Shortcut } from "../ui/keyboard-shortcut.js";
import type { ReturnGuard } from "./return-guards.js";
import { useOpenCoveringPage } from "./use-open-covering-page.js";
import { useReturnFocus } from "./use-return-focus.js";

const COVERING_PAGE_SHORTCUTS: Readonly<Record<CoveringPage, Shortcut>> = {
  calendar: { key: "c", ctrl: true, shift: true },
  trash: { key: "t", ctrl: true, shift: true },
  search: { key: "f", ctrl: true },
};

const coveringPageShortcut = (event: KeyboardEvent) => findShortcut(event, COVERING_PAGE_SHORTCUTS);

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
        matchesShortcut(event, { key: "Escape" }) &&
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
 * waits for the covering page to finish any changes, including a running
 * push back (§7.14), and asks the return page’s
 * unsaved-changes guard if it needs a refresh, then puts focus back where it
 * was. Only the user's navigation closes a covering page: a redirect of the
 * page behind it, such as after undoing a folder's creation, happens underneath.
 */
export function useCoveringPage(runGuards: ReturnGuard) {
  const open = useOpenCoveringPage();
  const returning = useRef(false);
  const restoreFocusAfterReturn = useReturnFocus();

  const goBack = useCallback(async () => {
    if (returning.current || useReturnPageStore.getState().covering === null) {
      return;
    }
    returning.current = true;
    try {
      await settleReturnPageWrites();
      const { busy, covering, stale } = useReturnPageStore.getState();
      if (busy || covering === null) {
        return;
      }
      if (!stale || (await runGuards())) {
        restoreFocusAfterReturn();
        useReturnPageStore.getState().uncover();
      }
    } finally {
      returning.current = false;
    }
  }, [runGuards, restoreFocusAfterReturn]);

  useCoveringPageKeys(open, () => void goBack());
  return { goBack };
}
