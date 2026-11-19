import type { RefObject } from "react";
import { usePointerReorder } from "./use-pointer-reorder.js";
import { useRestoreRowFocus } from "./use-restore-row-focus.js";
import { useSerialReorder } from "./use-serial-reorder.js";

/** Options for {@link useListReorder}. */
export interface ListReorderOptions<Row> {
  readonly listRef: RefObject<HTMLElement | null>;
  /** The attribute holding an active row's ID, such as `data-lookup-row-id`. */
  readonly rowAttribute: string;
  /** Every row of the list as last loaded, archived ones included. */
  readonly rows: ReadonlyArray<Row>;
  /** IDs of the rows that can move, in displayed order. */
  readonly activeIds: ReadonlyArray<string>;
  /** Saves a one-step move. Resolves true when a new order was saved. */
  readonly move: (rows: ReadonlyArray<Row>, id: string, direction: -1 | 1) => Promise<boolean>;
  /** Saves a drag to the target's slot. Resolves true when a new order was saved. */
  readonly dragReorder: (
    rows: ReadonlyArray<Row>,
    draggedId: string,
    targetId: string,
  ) => Promise<boolean>;
}

/**
 * Button, Alt+Arrow and pointer-drag reordering for an ordered settings list.
 * One reorder runs at a time and later requests are ignored until the saved
 * order arrives, so a double-click moves a row once. Keyboard moves put focus
 * back on the moved row.
 */
export function useListReorder<Row>(options: ListReorderOptions<Row>) {
  const { listRef, rowAttribute, rows } = options;
  const restoreFocus = useRestoreRowFocus(listRef, rowAttribute, rows);
  const reorder = useSerialReorder(rows);
  const drag = usePointerReorder({
    listRef,
    rowAttribute,
    activeIds: options.activeIds,
    onDrop: (draggedId, targetId) => {
      void reorder.run((current) => options.dragReorder(current, draggedId, targetId));
    },
  });

  const move = (id: string, direction: -1 | 1, keepFocus: boolean) => {
    if (reorder.busy) {
      return;
    }
    restoreFocus(keepFocus ? id : null);
    void reorder.run((current) => options.move(current, id, direction));
  };

  return { busy: reorder.busy, drag, move };
}
