import { type RefObject, useCallback, useEffect, useRef } from "react";

/**
 * Puts focus back on a row after its list re-renders, for example after a
 * keyboard reorder moved the focused element. Call the returned function with
 * the row's ID before the change, or with `null` to skip restoring focus.
 */
export function useRestoreRowFocus(
  listRef: RefObject<HTMLElement | null>,
  rowAttribute: string,
  rows: unknown,
): (id: string | null) => void {
  const pendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingIdRef.current;
    if (id === null) {
      return;
    }
    pendingIdRef.current = null;
    listRef.current?.querySelector<HTMLElement>(`[${rowAttribute}="${id}"]`)?.focus();
  }, [rows, listRef, rowAttribute]);

  return useCallback((id: string | null) => {
    pendingIdRef.current = id;
  }, []);
}
