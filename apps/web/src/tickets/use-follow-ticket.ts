import { type RefObject, useCallback, useEffect, useRef } from "react";
import { TICKET_ROW_ATTRIBUTE } from "./use-ticket-drag.js";

function rowElement(list: HTMLElement | null, itemId: string) {
  return list?.querySelector<HTMLElement>(`[${TICKET_ROW_ATTRIBUTE}="${itemId}"]`) ?? null;
}

/** Focus is on nothing in particular, or still on the row being followed. */
function focusIsFree(list: HTMLElement | null, itemId: string) {
  const active = document.activeElement;
  return active === null || active === document.body || active === rowElement(list, itemId);
}

/**
 * Keeps focus on a moved ticket by ID (§7.16). A move re-renders the row in
 * its new place, possibly in another section, which drops its focus. The row
 * is focused once now and again after the next board change, unless the user
 * has focused something else meanwhile.
 */
export function useFollowTicket(listRef: RefObject<HTMLElement | null>, board: unknown) {
  const pending = useRef<string | null>(null);

  const focus = useCallback(
    (itemId: string) => {
      const list = listRef.current;
      if (focusIsFree(list, itemId)) {
        const row = rowElement(list, itemId);
        row?.scrollIntoView({ block: "nearest" });
        row?.focus();
      }
    },
    [listRef],
  );

  useEffect(() => {
    const itemId = pending.current;
    pending.current = null;
    if (itemId !== null) {
      focus(itemId);
    }
  }, [board, focus]);

  return useCallback(
    (itemId: string) => {
      pending.current = itemId;
      focus(itemId);
    },
    [focus],
  );
}
