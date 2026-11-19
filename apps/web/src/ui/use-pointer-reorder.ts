import { type PointerEvent as ReactPointerEvent, type RefObject, useRef, useState } from "react";
import { usePointerDrag } from "./use-pointer-drag.js";

/** Drop placement relative to a hovered row during pointer drag. */
export type DropEdge = "before" | "after" | null;

interface DragState {
  readonly draggedId: string;
  readonly overId: string | null;
}

/** Options for {@link usePointerReorder}. */
export interface PointerReorderOptions {
  /** The list whose rows can be dragged. */
  readonly listRef: RefObject<HTMLElement | null>;
  /** The attribute holding a draggable row's ID, such as `data-lookup-row-id`. */
  readonly rowAttribute: string;
  /** IDs of the rows that can be dragged and dropped on, in displayed order. */
  readonly activeIds: ReadonlyArray<string>;
  /** Called when a row is dropped on another draggable row. */
  readonly onDrop: (draggedId: string, targetId: string) => void;
}

/** The pointer-drag state of a reorderable list. */
export interface PointerReorder {
  readonly draggedId: string | null;
  readonly startDrag: (id: string, event: ReactPointerEvent<HTMLElement>) => void;
  readonly dropEdgeFor: (rowId: string) => DropEdge;
}

function distanceToRect(clientY: number, rect: DOMRect): number {
  if (clientY >= rect.top && clientY <= rect.bottom) {
    return 0;
  }
  return Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
}

/** Finds the row under the pointer, or the nearest row when the pointer is between rows. */
function findRowIdAtY(list: HTMLElement | null, rowAttribute: string, clientY: number) {
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const element of list?.querySelectorAll<HTMLElement>(`[${rowAttribute}]`) ?? []) {
    const distance = distanceToRect(clientY, element.getBoundingClientRect());
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = element.getAttribute(rowAttribute);
    }
  }
  return nearestId;
}

function dropEdge(rowId: string, activeIds: ReadonlyArray<string>, drag: DragState | null) {
  if (drag === null || drag.overId !== rowId || drag.draggedId === rowId) {
    return null;
  }
  const fromIndex = activeIds.indexOf(drag.draggedId);
  const toIndex = activeIds.indexOf(rowId);
  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }
  return toIndex < fromIndex ? "before" : "after";
}

/**
 * Drag-to-reorder with pointer events on a row handle. Tracks the hovered row
 * while the pointer moves and reports the drop target when it is released.
 */
export function usePointerReorder({
  listRef,
  rowAttribute,
  activeIds,
  onDrop,
}: PointerReorderOptions): PointerReorder {
  const [drag, setDrag] = useState<DragState | null>(null);

  const start = usePointerDrag();
  const latest = useRef(onDrop);
  latest.current = onDrop;

  const startDrag = (id: string, event: ReactPointerEvent<HTMLElement>) => {
    const rowAt = (pointer: MouseEvent) =>
      findRowIdAtY(listRef.current, rowAttribute, pointer.clientY);
    start(event, {
      move: (pointer) => setDrag({ draggedId: id, overId: rowAt(pointer) }),
      drop: (pointer) => {
        const targetId = rowAt(pointer);
        if (targetId !== null && targetId !== id) {
          latest.current(id, targetId);
        }
      },
      end: () => setDrag(null),
    });
  };

  return {
    draggedId: drag?.draggedId ?? null,
    startDrag,
    dropEdgeFor: (rowId) => dropEdge(rowId, activeIds, drag),
  };
}
