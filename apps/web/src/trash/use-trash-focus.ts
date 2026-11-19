import type { TrashBatch } from "@task-tracker/contracts";
import { type RefObject, useCallback, useEffect, useRef } from "react";

type Batch = typeof TrashBatch.Type;

/** A row whose change finished, and the rows after it in list order. */
interface PendingFocus {
  readonly batchId: string;
  readonly following: ReadonlyArray<string>;
}

/** The attribute that identifies a batch's row for focus. */
export const TRASH_ROW_ATTRIBUTE = "data-batch-id";

/**
 * Keeps keyboard focus in Trash while its rows change (§7.6). Before a change
 * makes the buttons busy, focus moves to the row or the list, so a disabled
 * button never drops it. Once a changed row has left the list, focus goes to
 * the next row that is still listed, else to the list itself.
 */
export function useTrashFocus(
  listRef: RefObject<HTMLElement | null>,
  batches: ReadonlyArray<Batch>,
) {
  const held = useRef<PendingFocus | null>(null);
  const pending = useRef<PendingFocus | null>(null);
  const latest = useRef(batches);
  latest.current = batches;

  const rowOf = useCallback(
    (batchId: string) =>
      listRef.current?.querySelector<HTMLElement>(`[${TRASH_ROW_ATTRIBUTE}="${batchId}"]`) ?? null,
    [listRef],
  );

  const settle = useCallback(() => {
    const request = pending.current;
    if (request === null || rowOf(request.batchId) !== null) {
      return;
    }
    pending.current = null;
    const next = request.following.map(rowOf).find((row) => row !== null);
    (next ?? listRef.current)?.focus();
  }, [listRef, rowOf]);

  useEffect(settle, [batches, settle]);

  return {
    /** Focuses the row a change starts from and remembers the rows after it. */
    holdRow: (batchId: string) => {
      const ids = latest.current.map((batch) => batch.batchId);
      held.current = { batchId, following: ids.slice(ids.indexOf(batchId) + 1) };
      rowOf(batchId)?.focus();
    },
    /** Focuses the list, for a change to every row. */
    holdList: () => listRef.current?.focus(),
    /** Moves focus on from the held row once its finished change removes it. */
    afterChange: () => {
      pending.current = held.current;
      held.current = null;
      settle();
    },
  };
}
